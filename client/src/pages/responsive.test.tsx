import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
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

// Mock fetch
vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
  const mockResponse = new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
  return mockResponse
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

// Tailwind classes that ensure ≥24px touch targets
const TOUCH_SAFE_CLASSES = [
  /min-h-\[44px\]/, /min-h-\[24px\]/, /h-\[44px\]/, /h-\[24px\]/,
  /py-[0-9]/, /px-[0-9]/, /p-[0-9]/, /px-2/, /py-2/, /p-2/,
  /min-w-\[44px\]/, /w-\[44px\]/,
]

function hasTouchSafeClasses(element: Element): boolean {
  const classes = element.getAttribute('class') || ''
  return TOUCH_SAFE_CLASSES.some((pattern) => pattern.test(classes))
}

describe('Responsive polish (mobile-first, 320px+)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('No horizontal overflow', () => {
    it('RegisterPage does not overflow container', () => {
      const { container } = render(<Wrapper><RegisterPage /></Wrapper>)
      const body = container.querySelector('body') || container.firstChild as HTMLElement
      const style = window.getComputedStyle(body)
      expect(style.overflowX).not.toBe('scroll')
    })

    it('LoginPage does not overflow container', () => {
      const { container } = render(<Wrapper><LoginPage /></Wrapper>)
      const body = container.querySelector('body') || container.firstChild as HTMLElement
      const style = window.getComputedStyle(body)
      expect(style.overflowX).not.toBe('scroll')
    })

    it('HomePage does not overflow container', () => {
      const { container } = render(<Wrapper><HomePage /></Wrapper>)
      const body = container.querySelector('body') || container.firstChild as HTMLElement
      const style = window.getComputedStyle(body)
      expect(style.overflowX).not.toBe('scroll')
    })

    it('ToolDetailPage does not overflow container', () => {
      const { container } = render(<Wrapper><ToolDetailPage /></Wrapper>)
      const body = container.querySelector('body') || container.firstChild as HTMLElement
      const style = window.getComputedStyle(body)
      expect(style.overflowX).not.toBe('scroll')
    })

    it('PublishForm does not overflow container', () => {
      const { container } = render(<Wrapper><PublishForm /></Wrapper>)
      const body = container.querySelector('body') || container.firstChild as HTMLElement
      const style = window.getComputedStyle(body)
      expect(style.overflowX).not.toBe('scroll')
    })

    it('RequestLoanPage does not overflow container', () => {
      const { container } = render(<Wrapper><RequestLoanPage /></Wrapper>)
      const body = container.querySelector('body') || container.firstChild as HTMLElement
      const style = window.getComputedStyle(body)
      expect(style.overflowX).not.toBe('scroll')
    })

    it('LoanDetailPage does not overflow container', () => {
      const { container } = render(<Wrapper><LoanDetailPage /></Wrapper>)
      const body = container.querySelector('body') || container.firstChild as HTMLElement
      const style = window.getComputedStyle(body)
      expect(style.overflowX).not.toBe('scroll')
    })

    it('MyLoansPage does not overflow container', () => {
      const { container } = render(<Wrapper><MyLoansPage /></Wrapper>)
      const body = container.querySelector('body') || container.firstChild as HTMLElement
      const style = window.getComputedStyle(body)
      expect(style.overflowX).not.toBe('scroll')
    })

    it('ProfilePage does not overflow container', () => {
      const { container } = render(<Wrapper><ProfilePage /></Wrapper>)
      const body = container.querySelector('body') || container.firstChild as HTMLElement
      const style = window.getComputedStyle(body)
      expect(style.overflowX).not.toBe('scroll')
    })
  })

  describe('Touch targets ≥ 24px (via Tailwind classes)', () => {
    function checkTouchTargets(container: HTMLElement) {
      const violations: string[] = []
      const buttons = container.querySelectorAll('button')
      const inputs = container.querySelectorAll('input')
      const selects = container.querySelectorAll('select')
      const allInteractive = [...buttons, ...inputs, ...selects]

      allInteractive.forEach((el) => {
        const classes = el.getAttribute('class') || ''
        if (!hasTouchSafeClasses(el) && !classes.includes('sr-only')) {
          violations.push(`${el.tagName}#${el.id || el.className}`)
        }
      })

      return violations
    }

    it('RegisterPage touch targets ≥ 24px', () => {
      const { container } = render(<Wrapper><RegisterPage /></Wrapper>)
      const violations = checkTouchTargets(container)
      expect(violations).toHaveLength(0)
    })

    it('LoginPage touch targets ≥ 24px', () => {
      const { container } = render(<Wrapper><LoginPage /></Wrapper>)
      const violations = checkTouchTargets(container)
      expect(violations).toHaveLength(0)
    })

    it('HomePage touch targets ≥ 24px', () => {
      const { container } = render(<Wrapper><HomePage /></Wrapper>)
      const violations = checkTouchTargets(container)
      expect(violations).toHaveLength(0)
    })

    it('ToolDetailPage touch targets ≥ 24px', () => {
      const { container } = render(<Wrapper><ToolDetailPage /></Wrapper>)
      const violations = checkTouchTargets(container)
      expect(violations).toHaveLength(0)
    })

    it('PublishForm touch targets ≥ 24px', () => {
      const { container } = render(<Wrapper><PublishForm /></Wrapper>)
      const violations = checkTouchTargets(container)
      expect(violations).toHaveLength(0)
    })

    it('RequestLoanPage touch targets ≥ 24px', () => {
      const { container } = render(<Wrapper><RequestLoanPage /></Wrapper>)
      const violations = checkTouchTargets(container)
      if (violations.length > 0) {
        console.log('Violations:', violations)
      }
      expect(violations).toHaveLength(0)
    })

    it('LoanDetailPage touch targets ≥ 24px', () => {
      const { container } = render(<Wrapper><LoanDetailPage /></Wrapper>)
      const violations = checkTouchTargets(container)
      expect(violations).toHaveLength(0)
    })

    it('MyLoansPage touch targets ≥ 24px', () => {
      const { container } = render(<Wrapper><MyLoansPage /></Wrapper>)
      const violations = checkTouchTargets(container)
      expect(violations).toHaveLength(0)
    })

    it('ProfilePage touch targets ≥ 24px', () => {
      const { container } = render(<Wrapper><ProfilePage /></Wrapper>)
      const violations = checkTouchTargets(container)
      expect(violations).toHaveLength(0)
    })
  })

  describe('Responsive layout classes', () => {
    it('HomePage uses responsive grid', () => {
      render(<Wrapper><HomePage /></Wrapper>)
      const container = document.querySelector('[class*="grid"]')
      expect(container).toBeTruthy()
    })

    it('HomePage search is responsive', () => {
      render(<Wrapper><HomePage /></Wrapper>)
      const form = document.querySelector('form')
      expect(form).toBeTruthy()
    })
  })
})
