import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router-dom'
import { RegisterPage } from './RegisterPage'
import { LoginPage } from './LoginPage'
import { HomePage } from './HomePage'
import { ToolDetailPage } from './ToolDetailPage'
import { PublishForm } from './PublishForm'
import { RequestLoanPage } from './RequestLoanPage'
import { LoanDetailPage } from './LoanDetailPage'
import { MyLoansPage } from './MyLoansPage'
import { ProfilePage } from './ProfilePage'

// Mock fetch globally
vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    headers: new Headers(),
  } as Response
})

// Mock useAuth
vi.mock('../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    currentUser: { id: 'user-1', name: 'Ana', email: 'ana@example.com' },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

afterEach(cleanup)

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

async function checkAccessibility(container: HTMLElement) {
  const results = await axe.run(container)
  return results
}

describe('Accessibility audit (WCAG 2.2 AA)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('RegisterPage', () => {
    it('has 0 WCAG violations', async () => {
      const { container } = render(
        <Wrapper><RegisterPage /></Wrapper>,
      )
      const results = await checkAccessibility(container)
      expect(results.violations).toHaveLength(0)
    })

    it('all form fields have labels', () => {
      render(<Wrapper><RegisterPage /></Wrapper>)
      const inputs = document.querySelectorAll('input')
      inputs.forEach((input) => {
        const label = document.querySelector(`label[for="${input.id}"]`)
        const ariaLabel = input.getAttribute('aria-label')
        const ariaLabelledBy = input.getAttribute('aria-labelledby')
        expect(label || ariaLabel || ariaLabelledBy).toBeTruthy()
      })
    })
  })

  describe('LoginPage', () => {
    it('has 0 WCAG violations', async () => {
      const { container } = render(
        <Wrapper><LoginPage /></Wrapper>,
      )
      const results = await checkAccessibility(container)
      expect(results.violations).toHaveLength(0)
    })

    it('all form fields have labels', () => {
      render(<Wrapper><LoginPage /></Wrapper>)
      const inputs = document.querySelectorAll('input')
      inputs.forEach((input) => {
        const label = document.querySelector(`label[for="${input.id}"]`)
        const ariaLabel = input.getAttribute('aria-label')
        const ariaLabelledBy = input.getAttribute('aria-labelledby')
        expect(label || ariaLabel || ariaLabelledBy).toBeTruthy()
      })
    })
  })

  describe('HomePage', () => {
    it('has 0 WCAG violations', async () => {
      const { container } = render(
        <Wrapper><HomePage /></Wrapper>,
      )
      const results = await checkAccessibility(container)
      expect(results.violations).toHaveLength(0)
    })

    it('search input has accessible label', () => {
      render(<Wrapper><HomePage /></Wrapper>)
      const searchInput = document.querySelector('input[type="search"], input[placeholder*="buscar"], input[placeholder*="Buscar"]')
      if (searchInput) {
        const label = document.querySelector(`label[for="${searchInput.id}"]`)
        const ariaLabel = searchInput.getAttribute('aria-label')
        const ariaLabelledBy = searchInput.getAttribute('aria-labelledby')
        expect(label || ariaLabel || ariaLabelledBy).toBeTruthy()
      }
    })

    it('navigation links have visible text', () => {
      render(<Wrapper><HomePage /></Wrapper>)
      const links = document.querySelectorAll('a')
      links.forEach((link) => {
        expect(link.textContent?.trim()).toBeTruthy()
      })
    })
  })

  describe('ToolDetailPage', () => {
    it('has 0 WCAG violations', async () => {
      const { container } = render(
        <Wrapper><ToolDetailPage /></Wrapper>,
      )
      const results = await checkAccessibility(container)
      expect(results.violations).toHaveLength(0)
    })

    it('action button has accessible name', () => {
      render(<Wrapper><ToolDetailPage /></Wrapper>)
      const buttons = document.querySelectorAll('button')
      buttons.forEach((button) => {
        const text = button.textContent?.trim()
        const ariaLabel = button.getAttribute('aria-label')
        expect(text || ariaLabel).toBeTruthy()
      })
    })
  })

  describe('PublishForm', () => {
    it('has 0 WCAG violations', async () => {
      const { container } = render(
        <Wrapper><PublishForm /></Wrapper>,
      )
      const results = await checkAccessibility(container)
      expect(results.violations).toHaveLength(0)
    })

    it('all form fields have labels', () => {
      render(<Wrapper><PublishForm /></Wrapper>)
      const inputs = document.querySelectorAll('input, select, textarea')
      inputs.forEach((input) => {
        const label = document.querySelector(`label[for="${input.id}"]`)
        const ariaLabel = input.getAttribute('aria-label')
        const ariaLabelledBy = input.getAttribute('aria-labelledby')
        expect(label || ariaLabel || ariaLabelledBy).toBeTruthy()
      })
    })
  })

  describe('RequestLoanPage', () => {
    it('has 0 WCAG violations', async () => {
      const { container } = render(
        <Wrapper><RequestLoanPage /></Wrapper>,
      )
      const results = await checkAccessibility(container)
      expect(results.violations).toHaveLength(0)
    })

    it('all form fields have labels', () => {
      render(<Wrapper><RequestLoanPage /></Wrapper>)
      const inputs = document.querySelectorAll('input, textarea')
      inputs.forEach((input) => {
        const label = document.querySelector(`label[for="${input.id}"]`)
        const ariaLabel = input.getAttribute('aria-label')
        const ariaLabelledBy = input.getAttribute('aria-labelledby')
        expect(label || ariaLabel || ariaLabelledBy).toBeTruthy()
      })
    })
  })

  describe('LoanDetailPage', () => {
    it('has 0 WCAG violations', async () => {
      const { container } = render(
        <Wrapper><LoanDetailPage /></Wrapper>,
      )
      const results = await checkAccessibility(container)
      expect(results.violations).toHaveLength(0)
    })
  })

  describe('MyLoansPage', () => {
    it('has 0 WCAG violations', async () => {
      const { container } = render(
        <Wrapper><MyLoansPage /></Wrapper>,
      )
      const results = await checkAccessibility(container)
      expect(results.violations).toHaveLength(0)
    })

    it('tabs have ARIA roles', async () => {
      render(<Wrapper><MyLoansPage /></Wrapper>)
      await waitFor(() => {
        const tablist = document.querySelector('[role="tablist"]')
        const tabs = document.querySelectorAll('[role="tab"]')
        expect(tablist).toBeTruthy()
        expect(tabs.length).toBeGreaterThan(0)
      })
    })
  })

  describe('ProfilePage', () => {
    it('has 0 WCAG violations', async () => {
      const { container } = render(
        <Wrapper><ProfilePage /></Wrapper>,
      )
      const results = await checkAccessibility(container)
      expect(results.violations).toHaveLength(0)
    })

    it('password form fields have labels', () => {
      render(<Wrapper><ProfilePage /></Wrapper>)
      const inputs = document.querySelectorAll('input[type="password"]')
      inputs.forEach((input) => {
        const label = document.querySelector(`label[for="${input.id}"]`)
        const ariaLabel = input.getAttribute('aria-label')
        const ariaLabelledBy = input.getAttribute('aria-labelledby')
        expect(label || ariaLabel || ariaLabelledBy).toBeTruthy()
      })
    })

    it('tabs have ARIA roles', async () => {
      render(<Wrapper><ProfilePage /></Wrapper>)
      await waitFor(() => {
        const tablist = document.querySelector('[role="tablist"]')
        const tabs = document.querySelectorAll('[role="tab"]')
        expect(tablist).toBeTruthy()
        expect(tabs.length).toBeGreaterThan(0)
      })
    })
  })
})
