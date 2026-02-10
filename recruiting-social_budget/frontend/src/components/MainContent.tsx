import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'

interface Employee {
  id: string
  name: string
  team: string
  department?: string
}

interface ExpenseResponse {
  id: string
  date: string
  description: string
  amount: number
  cost_per_person: number
  attendees: Employee[]
  receipt_url?: string
}

interface BudgetTeam {
  team: string
  department: string
  headcount: number
  allocated: number
  spent: number
  remaining: number
}

interface BudgetDepartment {
  department: string
  allocated: number
  spent: number
  remaining: number
}

interface BudgetResponse {
  year: number
  quarter: number
  department_totals: BudgetDepartment[]
  team_totals: BudgetTeam[]
}

const MainContent = () => {
  const today = new Date()
  const currentQuarter = Math.floor(today.getMonth() / 3) + 1
  const currentYear = today.getFullYear()

  const [employees, setEmployees] = useState<Employee[]>([])
  const [expenses, setExpenses] = useState<ExpenseResponse[]>([])
  const [budgets, setBudgets] = useState<BudgetResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const [year, setYear] = useState(currentYear)
  const [quarter, setQuarter] = useState(currentQuarter)

  const [formDate, setFormDate] = useState(today.toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [attendees, setAttendees] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attendeeQuery, setAttendeeQuery] = useState('')
  const [isAttendeeOpen, setIsAttendeeOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptUrl, setReceiptUrl] = useState('')
  const [expandedExpenses, setExpandedExpenses] = useState<Set<string>>(new Set())

  const yearOptions = useMemo(() => {
    return [currentYear - 1, currentYear, currentYear + 1]
  }, [currentYear])

  const currencyFormatter = useMemo(() => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    })
  }, [])

  const formatCurrency = (value: number) => currencyFormatter.format(value)

  const employeeById = useMemo(() => {
    const mapping: Record<string, Employee> = {}
    employees.forEach(employee => {
      mapping[employee.id] = employee
    })
    return mapping
  }, [employees])

  const teamNames = useMemo(
    () => [...new Set(employees.map(e => e.team))],
    [employees]
  )

  const filteredTeams = useMemo(() => {
    const query = attendeeQuery.trim().toLowerCase()
    return teamNames.filter(teamName => {
      const hasSomeoneToAdd = employees.some(
        e => e.team === teamName && !attendees.includes(e.id)
      )
      if (!hasSomeoneToAdd) return false
      if (!query) return true
      return teamName.toLowerCase().includes(query)
    })
  }, [teamNames, employees, attendeeQuery, attendees])

  const filteredEmployees = useMemo(() => {
    const query = attendeeQuery.trim().toLowerCase()
    return employees.filter(employee => {
      if (attendees.includes(employee.id)) {
        return false
      }
      if (!query) {
        return true
      }
      return `${employee.name} ${employee.team}`.toLowerCase().includes(query)
    })
  }, [employees, attendeeQuery, attendees])

  const dropdownItems = useMemo(() => {
    const teamEntries = filteredTeams.map(team => ({ type: 'team' as const, team }))
    const employeeEntries = filteredEmployees.map(employee => ({
      type: 'employee' as const,
      employee,
    }))
    return [...teamEntries, ...employeeEntries]
  }, [filteredTeams, filteredEmployees])

  const costPerPerson = useMemo(() => {
    const amountValue = Number(amount)
    if (!amountValue || attendees.length === 0) {
      return 0
    }
    return amountValue / attendees.length
  }, [amount, attendees])

  const loadEmployees = async () => {
    const response = await fetch('/api/employees')
    if (!response.ok) {
      throw new Error('Failed to load employees')
    }
    const data = await response.json()
    setEmployees(data)
  }

  const loadExpensesAndBudgets = async (selectedYear: number, selectedQuarter: number) => {
    const [expensesResponse, budgetsResponse] = await Promise.all([
      fetch(`/api/expenses?year=${selectedYear}&quarter=${selectedQuarter}`),
      fetch(`/api/budgets?year=${selectedYear}&quarter=${selectedQuarter}`),
    ])

    if (!expensesResponse.ok) {
      throw new Error('Failed to load expenses')
    }
    if (!budgetsResponse.ok) {
      throw new Error('Failed to load budgets')
    }

    const expensesData = await expensesResponse.json()
    const budgetsData = await budgetsResponse.json()

    setExpenses(expensesData.expenses ?? [])
    setBudgets(budgetsData)
  }

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        await loadEmployees()
        await loadExpensesAndBudgets(year, quarter)
      } catch (err: any) {
        setError(err.message || 'Something went wrong')
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        await loadExpensesAndBudgets(year, quarter)
      } catch (err: any) {
        setError(err.message || 'Something went wrong')
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [year, quarter])

  useEffect(() => {
    setHighlightIndex(0)
  }, [attendeeQuery, dropdownItems.length])

  const handleAttendeeSelect = (employeeId: string) => {
    setAttendees(prev => [...prev, employeeId])
    setAttendeeQuery('')
    setIsAttendeeOpen(true)
  }

  const handleAddTeam = (teamName: string) => {
    const toAdd = employees
      .filter(e => e.team === teamName && !attendees.includes(e.id))
      .map(e => e.id)
    if (toAdd.length > 0) {
      setAttendees(prev => [...prev, ...toAdd])
    }
    setAttendeeQuery('')
    setIsAttendeeOpen(true)
  }

  const handleAttendeeRemove = (employeeId: string) => {
    setAttendees(prev => prev.filter(id => id !== employeeId))
  }

  const handleAttendeeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && attendeeQuery === '' && attendees.length > 0) {
      const lastAttendee = attendees[attendees.length - 1]
      handleAttendeeRemove(lastAttendee)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIsAttendeeOpen(true)
      setHighlightIndex(prev => Math.min(prev + 1, dropdownItems.length - 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIsAttendeeOpen(true)
      setHighlightIndex(prev => Math.max(prev - 1, 0))
      return
    }

    if (event.key === 'Enter' && isAttendeeOpen && dropdownItems.length > 0) {
      event.preventDefault()
      const query = attendeeQuery.trim().toLowerCase()
      const matchedTeam = teamNames.find(t => t.toLowerCase() === query)
      if (matchedTeam) {
        handleAddTeam(matchedTeam)
        return
      }
      const item = dropdownItems[highlightIndex]
      if (item) {
        if (item.type === 'team') {
          handleAddTeam(item.team)
        } else {
          handleAttendeeSelect(item.employee.id)
        }
      }
    }

    if (event.key === 'Escape') {
      setIsAttendeeOpen(false)
    }
  }

  const handleReceiptFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    setReceiptFile(file)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    if (!receiptFile && !receiptUrl.trim()) {
      setError('Add a receipt upload or receipt URL before submitting.')
      setIsSubmitting(false)
      return
    }

    try {
      const formData = new FormData()
      formData.append('date', formDate)
      formData.append('description', description)
      formData.append('amount', amount)
      attendees.forEach(attendeeId => formData.append('attendeeIds[]', attendeeId))
      formData.append('receiptUrl', receiptUrl.trim())
      if (receiptFile) {
        formData.append('receipt', receiptFile)
      }

      const response = await fetch('/api/expenses', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create expense')
      }

      const nextDate = new Date().toISOString().slice(0, 10)
      setFormDate(nextDate)
      setDescription('')
      setAmount('')
      setAttendees([])
      setReceiptFile(null)
      setReceiptUrl('')
      setAttendeeQuery('')
      setToast('Expense submitted successfully.')
      setTimeout(() => setToast(''), 3000)
      await loadExpensesAndBudgets(year, quarter)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleExpandedExpense = (expenseId: string) => {
    setExpandedExpenses(prev => {
      const next = new Set(prev)
      if (next.has(expenseId)) {
        next.delete(expenseId)
      } else {
        next.add(expenseId)
      }
      return next
    })
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8">
        <div className="max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Social Budget</h1>
              <p className="text-sm text-gray-500 mt-1">
                Track team spend against quarterly budgets.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Year</label>
                <select
                  value={year}
                  onChange={event => setYear(Number(event.target.value))}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {yearOptions.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Quarter</label>
                <select
                  value={quarter}
                  onChange={event => setQuarter(Number(event.target.value))}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {[1, 2, 3, 4].map(option => (
                    <option key={option} value={option}>
                      Q{option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {toast && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {toast}
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div className="order-1 rounded-lg border border-gray-200 bg-white p-6 lg:order-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Team Budgets</h2>
                <div className="text-xs text-gray-500">
                  Q{quarter} {year}
                </div>
              </div>
              {isLoading ? (
                <div className="text-sm text-gray-500">Loading budgets...</div>
              ) : budgets ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Department totals</h3>
                    <div className="space-y-2 text-sm">
                      {budgets.department_totals.length === 0 ? (
                        <div className="text-gray-500">No department data.</div>
                      ) : (
                        budgets.department_totals.map(dept => (
                          <div key={dept.department} className="flex items-center justify-between">
                            <div className="text-gray-700">{dept.department}</div>
                            <div className="text-gray-900 font-medium">
                              {formatCurrency(dept.remaining)} remaining
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Teams</h3>
                    <div className="overflow-hidden rounded-lg border border-gray-200">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                          <tr>
                            <th className="px-3 py-2">Team</th>
                            <th className="px-3 py-2">Allocated</th>
                            <th className="px-3 py-2">Spent</th>
                            <th className="px-3 py-2">Remaining</th>
                          </tr>
                        </thead>
                        <tbody>
                          {budgets.team_totals.length === 0 ? (
                            <tr>
                              <td className="px-3 py-3 text-gray-500" colSpan={4}>
                                No budget data yet.
                              </td>
                            </tr>
                          ) : (
                            budgets.team_totals.map(team => (
                              <tr key={team.team} className="border-t border-gray-100">
                                <td className="px-3 py-2 text-gray-700">
                                  <div className="font-medium">{team.team}</div>
                                  <div className="text-xs text-gray-500">{team.department}</div>
                                </td>
                                <td className="px-3 py-2">{formatCurrency(team.allocated)}</td>
                                <td className="px-3 py-2">{formatCurrency(team.spent)}</td>
                                <td className="px-3 py-2 font-semibold">
                                  {formatCurrency(team.remaining)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">No budget data yet.</div>
              )}
            </div>

            <div className="order-2 rounded-lg border border-gray-200 bg-white p-6 lg:order-1">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Submit Expense</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={event => setFormDate(event.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Team lunch"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={event => setAmount(event.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Attendees
                  </label>
                  <div className="relative">
                    <div
                      className="flex flex-wrap gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-primary"
                      onClick={() => setIsAttendeeOpen(true)}
                    >
                      {attendees.map(attendeeId => {
                        const employee = employeeById[attendeeId]
                        return (
                          <span
                            key={attendeeId}
                            className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
                          >
                            {employee?.name || attendeeId}
                            <button
                              type="button"
                              onClick={() => handleAttendeeRemove(attendeeId)}
                              className="text-gray-500 hover:text-gray-700"
                              aria-label={`Remove ${employee?.name || 'attendee'}`}
                            >
                              ×
                            </button>
                          </span>
                        )
                      })}
                      <input
                        type="text"
                        value={attendeeQuery}
                        onChange={event => {
                          setAttendeeQuery(event.target.value)
                          setIsAttendeeOpen(true)
                        }}
                        onKeyDown={handleAttendeeKeyDown}
                        onFocus={() => setIsAttendeeOpen(true)}
                        onBlur={() => setTimeout(() => setIsAttendeeOpen(false), 120)}
                        placeholder={attendees.length === 0 ? 'Search employees or type a team name and press Enter' : ''}
                        className="flex-1 min-w-[140px] border-none p-0 text-sm focus:outline-none"
                      />
                    </div>
                    {isAttendeeOpen && dropdownItems.length > 0 && (
                      <div className="absolute z-10 mt-2 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow">
                        {dropdownItems.map((item, index) =>
                          item.type === 'team' ? (
                            <button
                              key={`team-${item.team}`}
                              type="button"
                              onMouseDown={event => {
                                event.preventDefault()
                                handleAddTeam(item.team)
                              }}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                                index === highlightIndex ? 'bg-gray-50' : ''
                              } text-primary font-medium`}
                            >
                              <span>Add team: {item.team}</span>
                            </button>
                          ) : (
                            <button
                              key={item.employee.id}
                              type="button"
                              onMouseDown={event => {
                                event.preventDefault()
                                handleAttendeeSelect(item.employee.id)
                              }}
                              className={`flex w-full items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 ${
                                index === highlightIndex ? 'bg-gray-50' : ''
                              }`}
                            >
                              <span>{item.employee.name}</span>
                              <span className="text-xs text-gray-500">— {item.employee.team}</span>
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    <div className="font-semibold text-gray-700">
                      Cost per person: {formatCurrency(costPerPerson)}
                    </div>
                    <div className="mt-1">
                      {attendees.length === 0
                        ? 'Select attendees to see the split.'
                        : attendees
                            .map(attendeeId => {
                              const employee = employeeById[attendeeId]
                              return employee ? `${employee.name} · ${employee.team}` : attendeeId
                            })
                            .join(', ')}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Receipt</label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleReceiptFileChange}
                    className="block w-full text-sm text-gray-600"
                  />
                  {receiptFile && (
                    <div className="mt-2 flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      <span>{receiptFile.name}</span>
                      <button
                        type="button"
                        onClick={() => setReceiptFile(null)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                      Or paste receipt URL
                    </label>
                    <input
                      type="url"
                      value={receiptUrl}
                      onChange={event => setReceiptUrl(event.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isSubmitting ? 'Saving...' : 'Submit receipt'}
                </button>
              </form>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Expense History</h2>
              <div className="text-xs text-gray-500">
                Showing Q{quarter} {year}
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2"></th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Cost / Person</th>
                    <th className="px-3 py-2">Teams Impacted</th>
                    <th className="px-3 py-2">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-500" colSpan={7}>
                        Loading expenses...
                      </td>
                    </tr>
                  ) : expenses.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-500" colSpan={7}>
                        No expenses logged for this quarter.
                      </td>
                    </tr>
                  ) : (
                    expenses.map(expense => {
                      const teams = Array.from(
                        new Set(expense.attendees.map(attendee => attendee.team))
                      )
                      const isExpanded = expandedExpenses.has(expense.id)
                      return (
                        <Fragment key={expense.id}>
                          <tr className="border-t border-gray-100">
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => toggleExpandedExpense(expense.id)}
                                className="text-xs text-gray-500 hover:text-gray-700"
                                aria-label="Toggle attendee list"
                              >
                                {isExpanded ? '–' : '+'}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-gray-700">{expense.date}</td>
                            <td className="px-3 py-2 text-gray-700">{expense.description}</td>
                            <td className="px-3 py-2">{formatCurrency(expense.amount)}</td>
                            <td className="px-3 py-2">
                              {formatCurrency(expense.cost_per_person)}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {teams.length === 0 ? '—' : teams.join(', ')}
                            </td>
                            <td className="px-3 py-2">
                              {expense.receipt_url ? (
                                <a
                                  href={expense.receipt_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center text-primary hover:underline"
                                  title="View receipt"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                  >
                                    <path d="M12.586 2.586a2 2 0 012.828 0l2 2a2 2 0 010 2.828l-6.5 6.5a2 2 0 01-.894.525l-3 1a1 1 0 01-1.263-1.263l1-3a2 2 0 01.525-.894l6.5-6.5z" />
                                    <path d="M8 6H5a3 3 0 00-3 3v6a3 3 0 003 3h6a3 3 0 003-3v-3a1 1 0 10-2 0v3a1 1 0 01-1 1H5a1 1 0 01-1-1V9a1 1 0 01-1-1 1 1 0 011-1h3a1 1 0 100-2z" />
                                  </svg>
                                </a>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-t border-gray-100 bg-gray-50">
                              <td className="px-3 py-3 text-xs text-gray-600" colSpan={7}>
                                <span className="font-semibold text-gray-700">Attendees:</span>{' '}
                                {expense.attendees
                                  .map(attendee => `${attendee.name} · ${attendee.team}`)
                                  .join(', ')}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MainContent
