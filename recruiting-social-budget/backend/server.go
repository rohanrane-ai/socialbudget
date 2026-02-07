package backend

import (
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	quarterBudgetPerPerson = 60.0
	dateLayout             = "2006-01-02"
)

type Server struct {
	storage    *Storage
	uploadsDir string
}

func NewServer(dataDir string) (*Server, error) {
	storage, err := NewStorage(dataDir)
	if err != nil {
		return nil, err
	}
	uploadsDir := filepath.Join("backend", "uploads")
	if err := os.MkdirAll(uploadsDir, 0o755); err != nil {
		return nil, err
	}
	return &Server{storage: storage, uploadsDir: uploadsDir}, nil
}

func (s *Server) RegisterRoutes(r *gin.Engine) {
	r.Static("/uploads", s.uploadsDir)
	api := r.Group("/api")
	{
		api.GET("/employees", s.handleEmployees)
		api.GET("/expenses", s.handleExpenses)
		api.POST("/expenses", s.handleCreateExpense)
		api.GET("/budgets", s.handleBudgets)
	}
}

func (s *Server) handleEmployees(c *gin.Context) {
	employees, err := s.storage.LoadEmployees()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load employees"})
		return
	}

	c.JSON(http.StatusOK, employees)
}

func (s *Server) handleExpenses(c *gin.Context) {
	year, quarter, err := parseYearQuarter(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	employees, err := s.storage.LoadEmployees()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load employees"})
		return
	}
	employeeMap := mapEmployeesByID(employees)

	expenses, err := s.storage.LoadExpenses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load expenses"})
		return
	}

	filtered := make([]ExpenseResponse, 0)
	for _, expense := range expenses {
		expenseDate, err := time.Parse(dateLayout, expense.Date)
		if err != nil {
			continue
		}
		if expenseDate.Year() != year || quarterFromDate(expenseDate) != quarter {
			continue
		}

		response, ok := buildExpenseResponse(expense, employeeMap)
		if ok {
			filtered = append(filtered, response)
		}
	}

	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].Date > filtered[j].Date
	})

	c.JSON(http.StatusOK, ExpensesResponse{Expenses: filtered})
}

func (s *Server) handleCreateExpense(c *gin.Context) {
	date := strings.TrimSpace(c.PostForm("date"))
	description := strings.TrimSpace(c.PostForm("description"))
	amountValue := strings.TrimSpace(c.PostForm("amount"))
	receiptURL := strings.TrimSpace(c.PostForm("receiptUrl"))
	attendeeIDs := c.PostFormArray("attendeeIds[]")
	if len(attendeeIDs) == 0 {
		attendeeIDs = c.PostFormArray("attendeeIds")
	}

	amount, err := strconv.ParseFloat(amountValue, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount must be a number"})
		return
	}
	if amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount must be greater than 0"})
		return
	}
	if len(attendeeIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least one attendee is required"})
		return
	}

	if _, err := time.Parse(dateLayout, date); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date must be in YYYY-MM-DD format"})
		return
	}

	employees, err := s.storage.LoadEmployees()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load employees"})
		return
	}
	employeeMap := mapEmployeesByID(employees)

	for _, attendee := range attendeeIDs {
		if _, ok := employeeMap[attendee]; !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("unknown attendee id: %s", attendee)})
			return
		}
	}

	uploadedReceipt, err := c.FormFile("receipt")
	if err == nil {
		safeName := sanitizeFilename(uploadedReceipt.Filename)
		filename := fmt.Sprintf("%d-%s", time.Now().UnixNano(), safeName)
		savePath := filepath.Join(s.uploadsDir, filename)
		if err := c.SaveUploadedFile(uploadedReceipt, savePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save receipt"})
			return
		}
		receiptURL = "/uploads/" + filename
	} else if receiptURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "receipt upload or receipt URL is required"})
		return
	}

	expenses, err := s.storage.LoadExpenses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load expenses"})
		return
	}

	expense := Expense{
		ID:          fmt.Sprintf("exp_%d", time.Now().UnixNano()),
		Date:        date,
		Description: description,
		Amount:      amount,
		Attendees:   attendeeIDs,
		ReceiptURL:  receiptURL,
	}
	expenses = append(expenses, expense)

	if err := s.storage.SaveExpenses(expenses); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save expense"})
		return
	}

	response, ok := buildExpenseResponse(expense, employeeMap)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build expense response"})
		return
	}

	c.JSON(http.StatusCreated, response)
}

func (s *Server) handleBudgets(c *gin.Context) {
	year, quarter, err := parseYearQuarter(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	employees, err := s.storage.LoadEmployees()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load employees"})
		return
	}

	expenses, err := s.storage.LoadExpenses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load expenses"})
		return
	}

	employeeMap := mapEmployeesByID(employees)
	teamBudgets := buildTeamBudgets(employees, expenses, employeeMap, year, quarter)
	departmentBudgets := buildDepartmentBudgets(teamBudgets)

	c.JSON(http.StatusOK, BudgetResponse{
		Year:             year,
		Quarter:          quarter,
		DepartmentTotals: departmentBudgets,
		TeamTotals:       teamBudgets,
	})
}

func parseYearQuarter(c *gin.Context) (int, int, error) {
	now := time.Now()

	year := now.Year()
	quarter := quarterFromDate(now)

	if yearParam := c.Query("year"); yearParam != "" {
		parsed, err := strconv.Atoi(yearParam)
		if err != nil || parsed <= 0 {
			return 0, 0, fmt.Errorf("invalid year")
		}
		year = parsed
	}

	if quarterParam := c.Query("quarter"); quarterParam != "" {
		parsed, err := strconv.Atoi(quarterParam)
		if err != nil || parsed < 1 || parsed > 4 {
			return 0, 0, fmt.Errorf("invalid quarter")
		}
		quarter = parsed
	}

	return year, quarter, nil
}

func quarterFromDate(date time.Time) int {
	month := int(date.Month())
	return (month-1)/3 + 1
}

func mapEmployeesByID(employees []Employee) map[string]Employee {
	employeeMap := make(map[string]Employee, len(employees))
	for _, employee := range employees {
		employeeMap[employee.ID] = employee
	}
	return employeeMap
}

func buildExpenseResponse(expense Expense, employeeMap map[string]Employee) (ExpenseResponse, bool) {
	if len(expense.Attendees) == 0 {
		return ExpenseResponse{}, false
	}

	attendees := make([]Employee, 0, len(expense.Attendees))
	for _, attendeeID := range expense.Attendees {
		employee, ok := employeeMap[attendeeID]
		if !ok {
			employee = Employee{
				ID:         attendeeID,
				Name:       "Unknown",
				Team:       "Unassigned",
				Department: "Unassigned",
			}
		}
		attendees = append(attendees, employee)
	}

	return ExpenseResponse{
		ID:            expense.ID,
		Date:          expense.Date,
		Description:   expense.Description,
		Amount:        expense.Amount,
		CostPerPerson: roundCurrency(expense.Amount / float64(len(expense.Attendees))),
		Attendees:     attendees,
		ReceiptURL:    expense.ReceiptURL,
	}, true
}

func sanitizeFilename(name string) string {
	name = filepath.Base(name)
	name = strings.ReplaceAll(name, " ", "-")
	name = strings.ReplaceAll(name, "_", "-")
	name = strings.ToLower(name)
	replacer := strings.NewReplacer("..", "", "/", "", "\\", "")
	name = replacer.Replace(name)
	if name == "" {
		return "receipt"
	}
	return name
}

func buildTeamBudgets(employees []Employee, expenses []Expense, employeeMap map[string]Employee, year int, quarter int) []BudgetTeam {
	teamHeadcount := make(map[string]int)
	teamDepartments := make(map[string]string)

	for _, employee := range employees {
		teamHeadcount[employee.Team]++
		teamDepartments[employee.Team] = employee.Department
	}

	teamSpent := make(map[string]float64)

	for _, expense := range expenses {
		expenseDate, err := time.Parse(dateLayout, expense.Date)
		if err != nil {
			continue
		}
		if expenseDate.Year() != year {
			continue
		}
		if quarterFromDate(expenseDate) > quarter {
			continue
		}
		if len(expense.Attendees) == 0 {
			continue
		}

		costPerPerson := expense.Amount / float64(len(expense.Attendees))
		for _, attendeeID := range expense.Attendees {
			employee, ok := employeeMap[attendeeID]
			if !ok {
				teamSpent["Unassigned"] += costPerPerson
				teamDepartments["Unassigned"] = "Unassigned"
				continue
			}
			teamSpent[employee.Team] += costPerPerson
			if teamDepartments[employee.Team] == "" {
				teamDepartments[employee.Team] = employee.Department
			}
		}
	}

	teams := make([]BudgetTeam, 0, len(teamHeadcount)+len(teamSpent))
	seenTeams := make(map[string]struct{})

	for team := range teamHeadcount {
		seenTeams[team] = struct{}{}
	}
	for team := range teamSpent {
		seenTeams[team] = struct{}{}
	}

	for team := range seenTeams {
		headcount := teamHeadcount[team]
		allocated := quarterBudgetPerPerson * float64(headcount) * float64(quarter)
		spent := teamSpent[team]
		teams = append(teams, BudgetTeam{
			Team:       team,
			Department: teamDepartments[team],
			Headcount:  headcount,
			Allocated:  roundCurrency(allocated),
			Spent:      roundCurrency(spent),
			Remaining:  roundCurrency(allocated - spent),
		})
	}

	sort.Slice(teams, func(i, j int) bool {
		if teams[i].Department == teams[j].Department {
			return teams[i].Team < teams[j].Team
		}
		return teams[i].Department < teams[j].Department
	})

	return teams
}

func buildDepartmentBudgets(teamBudgets []BudgetTeam) []BudgetDepartment {
	departmentTotals := make(map[string]*BudgetDepartment)

	for _, team := range teamBudgets {
		dept := team.Department
		if dept == "" {
			dept = "Unassigned"
		}
		if departmentTotals[dept] == nil {
			departmentTotals[dept] = &BudgetDepartment{Department: dept}
		}
		departmentTotals[dept].Allocated += team.Allocated
		departmentTotals[dept].Spent += team.Spent
		departmentTotals[dept].Remaining += team.Remaining
	}

	departments := make([]BudgetDepartment, 0, len(departmentTotals))
	for _, summary := range departmentTotals {
		summary.Allocated = roundCurrency(summary.Allocated)
		summary.Spent = roundCurrency(summary.Spent)
		summary.Remaining = roundCurrency(summary.Remaining)
		departments = append(departments, *summary)
	}

	sort.Slice(departments, func(i, j int) bool {
		return departments[i].Department < departments[j].Department
	})

	return departments
}

func roundCurrency(value float64) float64 {
	return math.Round(value*100) / 100
}
