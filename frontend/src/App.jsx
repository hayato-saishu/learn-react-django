import { useState, useEffect } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000/api/todos/'

function App() {
  const [todos, setTodos] = useState([])
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchTodos()
  }, [])

  const fetchTodos = async () => {
    try {
      const response = await fetch(API_URL)
      if (!response.ok) throw new Error('Failed to fetch todos')
      const data = await response.json()
      setTodos(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const addTodo = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, completed: false }),
      })
      if (!response.ok) throw new Error('Failed to add todo')
      const data = await response.json()
      setTodos([data, ...todos])
      setNewTitle('')
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleTodo = async (todo) => {
    try {
      const response = await fetch(`${API_URL}${todo.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !todo.completed }),
      })
      if (!response.ok) throw new Error('Failed to update todo')
      const updated = await response.json()
      setTodos(todos.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      setError(err.message)
    }
  }

  const deleteTodo = async (id) => {
    try {
      const response = await fetch(`${API_URL}${id}/`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete todo')
      setTodos(todos.filter((t) => t.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="container">
      <h1>Todo App</h1>
      <p className="subtitle">React + Django で作るシンプルなTodoアプリ</p>

      <form className="add-form" onSubmit={addTodo}>
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="新しいTodoを入力..."
        />
        <button type="submit">追加</button>
      </form>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="loading">読み込み中...</p>
      ) : (
        <ul className="todo-list">
          {todos.length === 0 && <li className="empty">Todoがありません</li>}
          {todos.map((todo) => (
            <li key={todo.id} className={`todo-item${todo.completed ? ' completed' : ''}`}>
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo)}
              />
              <span className="todo-title">{todo.title}</span>
              <button className="delete-btn" onClick={() => deleteTodo(todo.id)}>削除</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default App
