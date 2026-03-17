import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import apiClient from '../api/client'

interface FormState {
  username: string
  email: string
  password: string
  passwordConfirm: string
}

type FormErrors = Record<string, string>

const initialFormState: FormState = {
  username: '',
  email: '',
  password: '',
  passwordConfirm: '',
}

export default function RegisterForm() {
  const [formData, setFormData] = useState<FormState>(initialFormState)
  const [errors, setErrors] = useState<FormErrors>({})
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validate = (): FormErrors => {
    const newErrors: FormErrors = {}
    if (!formData.username) newErrors.username = 'ユーザー名は必須です'
    if (!formData.email) newErrors.email = 'メールアドレスは必須です'
    if (!formData.password) newErrors.password = 'パスワードは必須です'
    if (!formData.passwordConfirm) newErrors.passwordConfirm = 'パスワード（確認）は必須です'
    if (formData.password && formData.passwordConfirm && formData.password !== formData.passwordConfirm) {
      newErrors.passwordConfirm = 'パスワードが一致しません'
    }
    return newErrors
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setIsSubmitting(true)
    setErrors({})
    try {
      const response = await apiClient.post<{ message: string }>('/accounts/register/', {
        username: formData.username,
        email: formData.email,
        password: formData.password,
        password_confirm: formData.passwordConfirm,
      })
      setSuccessMessage(response.data.message)
      setFormData(initialFormState)
    } catch (err) {
      const error = err as { response?: { data?: Record<string, string | string[]> } }
      if (error.response?.data) {
        const serverErrors: FormErrors = {}
        for (const [key, messages] of Object.entries(error.response.data)) {
          serverErrors[key] = Array.isArray(messages) ? messages[0] : messages
        }
        setErrors(serverErrors)
      } else {
        setErrors({ non_field_errors: '登録に失敗しました。もう一度お試しください。' })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (successMessage) {
    return (
      <div role="alert" aria-live="polite">
        <p>{successMessage}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {errors.non_field_errors && <p role="alert">{errors.non_field_errors}</p>}

      <div>
        <label htmlFor="username">ユーザー名</label>
        <input
          id="username"
          name="username"
          type="text"
          value={formData.username}
          onChange={handleChange}
          aria-describedby={errors.username ? 'username-error' : undefined}
        />
        {errors.username && <p id="username-error" role="alert">{errors.username}</p>}
      </div>

      <div>
        <label htmlFor="email">メールアドレス</label>
        <input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && <p id="email-error" role="alert">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="password">パスワード</label>
        <input
          id="password"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
          aria-describedby={errors.password ? 'password-error' : undefined}
        />
        {errors.password && <p id="password-error" role="alert">{errors.password}</p>}
      </div>

      <div>
        <label htmlFor="passwordConfirm">パスワード（確認）</label>
        <input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          value={formData.passwordConfirm}
          onChange={handleChange}
          aria-describedby={errors.passwordConfirm ? 'passwordConfirm-error' : undefined}
        />
        {errors.passwordConfirm && <p id="passwordConfirm-error" role="alert">{errors.passwordConfirm}</p>}
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? '登録中...' : '登録する'}
      </button>
    </form>
  )
}
