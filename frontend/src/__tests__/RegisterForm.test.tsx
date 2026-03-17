import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import RegisterForm from '../components/RegisterForm'
import apiClient from '../api/client'

vi.mock('../api/client')

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders form fields', () => {
    render(<RegisterForm />)
    expect(screen.getByLabelText('ユーザー名')).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument()
    expect(screen.getByLabelText('パスワード')).toBeInTheDocument()
    expect(screen.getByLabelText('パスワード（確認）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '登録する' })).toBeInTheDocument()
  })

  test('shows validation error for empty fields', async () => {
    render(<RegisterForm />)
    await userEvent.click(screen.getByRole('button', { name: '登録する' }))
    expect(await screen.findByText('ユーザー名は必須です')).toBeInTheDocument()
  })

  test('shows password mismatch error', async () => {
    render(<RegisterForm />)
    await userEvent.type(screen.getByLabelText('ユーザー名'), 'testuser')
    await userEvent.type(screen.getByLabelText('メールアドレス'), 'test@example.com')
    await userEvent.type(screen.getByLabelText('パスワード'), 'StrongPass123!')
    await userEvent.type(screen.getByLabelText('パスワード（確認）'), 'DifferentPass456!')
    await userEvent.click(screen.getByRole('button', { name: '登録する' }))
    expect(await screen.findByText('パスワードが一致しません')).toBeInTheDocument()
  })

  test('submits successfully and shows success message', async () => {
    apiClient.post = vi.fn().mockResolvedValue({ data: { message: '登録が完了しました' } })
    render(<RegisterForm />)
    await userEvent.type(screen.getByLabelText('ユーザー名'), 'testuser')
    await userEvent.type(screen.getByLabelText('メールアドレス'), 'test@example.com')
    await userEvent.type(screen.getByLabelText('パスワード'), 'StrongPass123!')
    await userEvent.type(screen.getByLabelText('パスワード（確認）'), 'StrongPass123!')
    await userEvent.click(screen.getByRole('button', { name: '登録する' }))
    await waitFor(() => {
      expect(screen.getByText('登録が完了しました')).toBeInTheDocument()
    })
  })

  test('shows server error message on 400 response', async () => {
    apiClient.post = vi.fn().mockRejectedValue({
      response: { data: { username: ['このユーザー名は既に使用されています。'] } },
    })
    render(<RegisterForm />)
    await userEvent.type(screen.getByLabelText('ユーザー名'), 'existinguser')
    await userEvent.type(screen.getByLabelText('メールアドレス'), 'test@example.com')
    await userEvent.type(screen.getByLabelText('パスワード'), 'StrongPass123!')
    await userEvent.type(screen.getByLabelText('パスワード（確認）'), 'StrongPass123!')
    await userEvent.click(screen.getByRole('button', { name: '登録する' }))
    await waitFor(() => {
      expect(screen.getByText('このユーザー名は既に使用されています。')).toBeInTheDocument()
    })
  })

  test('disables button while submitting', async () => {
    apiClient.post = vi.fn().mockImplementation(() => new Promise(() => {}))
    render(<RegisterForm />)
    await userEvent.type(screen.getByLabelText('ユーザー名'), 'testuser')
    await userEvent.type(screen.getByLabelText('メールアドレス'), 'test@example.com')
    await userEvent.type(screen.getByLabelText('パスワード'), 'StrongPass123!')
    await userEvent.type(screen.getByLabelText('パスワード（確認）'), 'StrongPass123!')
    await userEvent.click(screen.getByRole('button', { name: '登録する' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '登録中...' })).toBeDisabled()
    })
  })
})
