package backend

type Employee struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Team       string `json:"team"`
	Department string `json:"department,omitempty"`
}

type Expense struct {
	ID          string   `json:"id"`
	Date        string   `json:"date"`
	Description string   `json:"description"`
	Amount      float64  `json:"amount"`
	Attendees   []string `json:"attendees"`
	ReceiptURL  string   `json:"receipt_url,omitempty"`
}

type ExpenseCreateRequest struct {
	Date        string   `json:"date"`
	Description string   `json:"description"`
	Amount      float64  `json:"amount"`
	Attendees   []string `json:"attendees"`
	ReceiptURL  string   `json:"receipt_url"`
}

type ExpenseResponse struct {
	ID            string     `json:"id"`
	Date          string     `json:"date"`
	Description   string     `json:"description"`
	Amount        float64    `json:"amount"`
	CostPerPerson float64    `json:"cost_per_person"`
	Attendees     []Employee `json:"attendees"`
	ReceiptURL    string     `json:"receipt_url,omitempty"`
}

type ExpensesResponse struct {
	Expenses []ExpenseResponse `json:"expenses"`
}

type BudgetTeam struct {
	Team       string  `json:"team"`
	Department string  `json:"department"`
	Headcount  int     `json:"headcount"`
	Allocated  float64 `json:"allocated"`
	Spent      float64 `json:"spent"`
	Remaining  float64 `json:"remaining"`
}

type BudgetDepartment struct {
	Department string  `json:"department"`
	Allocated  float64 `json:"allocated"`
	Spent      float64 `json:"spent"`
	Remaining  float64 `json:"remaining"`
}

type BudgetResponse struct {
	Year             int               `json:"year"`
	Quarter          int               `json:"quarter"`
	DepartmentTotals []BudgetDepartment `json:"department_totals"`
	TeamTotals       []BudgetTeam      `json:"team_totals"`
}
