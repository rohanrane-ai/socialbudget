package backend

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

type Storage struct {
	employeesPath string
	expensesPath  string
	mu            sync.Mutex
}

func NewStorage(dataDir string) (*Storage, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, err
	}

	employeesPath := filepath.Join(dataDir, "employees.json")
	expensesPath := filepath.Join(dataDir, "expenses.json")

	if err := ensureFile(employeesPath, []byte("[]")); err != nil {
		return nil, err
	}
	if err := ensureFile(expensesPath, []byte("[]")); err != nil {
		return nil, err
	}

	return &Storage{
		employeesPath: employeesPath,
		expensesPath:  expensesPath,
	}, nil
}

func ensureFile(path string, defaultContents []byte) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	return os.WriteFile(path, defaultContents, 0o644)
}

type employeeRaw struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Team       string `json:"team"`
	Manager    string `json:"manager"`
	Department string `json:"department"`
}

func (s *Storage) LoadEmployees() ([]Employee, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rawData, err := os.ReadFile(s.employeesPath)
	if err != nil {
		return nil, err
	}

	var rawEmployees []employeeRaw
	if err := json.Unmarshal(rawData, &rawEmployees); err != nil {
		return nil, err
	}

	employees := make([]Employee, 0, len(rawEmployees))
	idCounts := make(map[string]int)

	for _, raw := range rawEmployees {
		team := strings.TrimSpace(raw.Team)
		if team == "" {
			team = strings.TrimSpace(raw.Manager)
		}
		if team == "" {
			team = "Unassigned"
		}

		department := strings.TrimSpace(raw.Department)
		if department == "" {
			department = team
		}

		employeeID := strings.TrimSpace(raw.ID)
		if employeeID == "" {
			employeeID = slugify(fmt.Sprintf("%s-%s", raw.Name, team))
		}

		idCounts[employeeID]++
		if idCounts[employeeID] > 1 {
			employeeID = fmt.Sprintf("%s-%d", employeeID, idCounts[employeeID])
		}

		employees = append(employees, Employee{
			ID:         employeeID,
			Name:       strings.TrimSpace(raw.Name),
			Team:       team,
			Department: department,
		})
	}

	return employees, nil
}

func (s *Storage) LoadExpenses() ([]Expense, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rawData, err := os.ReadFile(s.expensesPath)
	if err != nil {
		return nil, err
	}

	if len(strings.TrimSpace(string(rawData))) == 0 {
		return []Expense{}, nil
	}

	var expenses []Expense
	if err := json.Unmarshal(rawData, &expenses); err != nil {
		return nil, err
	}

	return expenses, nil
}

func (s *Storage) SaveExpenses(expenses []Expense) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	encoded, err := json.MarshalIndent(expenses, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.expensesPath, encoded, 0o644)
}

func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, "_", "-")
	value = strings.ReplaceAll(value, " ", "-")
	re := regexp.MustCompile(`[^a-z0-9-]+`)
	value = re.ReplaceAllString(value, "")
	value = strings.Trim(value, "-")
	if value == "" {
		return "employee"
	}
	return value
}
