import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  Calculator,
  Car,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  GraduationCap,
  Home,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  schedule,
  type Loan,
  type LoanInput,
  type Instalment,
} from "../server/finance";

type User = {
  id: string;
  name: string;
  email: string;
  currency: string;
  googleConnected: boolean;
  hasPassword: boolean;
};
type AuthConfig = { googleEnabled: boolean; registrationEnabled: boolean };
const authMessages: Record<string, string> = {
  unavailable: "Google sign-in is not available yet.",
  cancelled: "Google sign-in was cancelled. You can try again.",
  expired: "This Google sign-in attempt expired. Please try again.",
  failed: "Google sign-in could not be verified. Please try again.",
  email_in_use:
    "An account already uses this email. Sign in with your password, then connect Google in Settings.",
  registration_disabled: "New account registration is disabled.",
  google_in_use:
    "That Google account is already connected to another workspace.",
  link_expired: "Your session changed. Sign in again before connecting Google.",
  already_linked: "A Google account is already connected to this workspace.",
};
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.92A6 6 0 0 1 6.1 12c0-.67.11-1.31.31-1.92V7.49H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.51l3.35-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.35 2.59A5.99 5.99 0 0 1 12 5.96Z"
      />
    </svg>
  );
}
type Page =
  "Overview" | "My loans" | "Payments" | "EMI calculator" | "Settings";
const dateISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const prettyDate = (
  s: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
) => new Date(s + "T12:00:00").toLocaleDateString("en-GB", options);
const icons = {
  Home,
  Auto: Car,
  Personal: Wallet,
  Education: GraduationCap,
  Business: Building2,
  Other: CreditCard,
};
const navItems = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "My loans", icon: Wallet },
  { name: "Payments", icon: CreditCard },
  { name: "EMI calculator", icon: Calculator },
] as const;
async function api<T>(url: string, method = "GET", data?: unknown): Promise<T> {
  const res = await fetch("/api" + url, {
    method,
    credentials: "same-origin",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await res.json();
  if (!res.ok)
    throw new Error(result.error ?? "Request failed. Please try again.");
  return result;
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <BarChart3 size={22} strokeWidth={2.4} />
      </span>
      <span>
        EMI<span className="brand-light">tracker</span>
        <span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function FitText({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current,
      parent = element?.parentElement;
    if (!element || !parent) return;
    let width = -1;
    const fit = () => {
      element.style.fontSize = "inherit";
      const base = parseFloat(getComputedStyle(parent).fontSize);
      if (element.scrollWidth > element.clientWidth)
        element.style.fontSize = `${Math.max(12, Math.floor((base * element.clientWidth) / element.scrollWidth))}px`;
    };
    const observer = new ResizeObserver((entries) => {
      const next = entries[0].contentRect.width;
      if (next !== width) {
        width = next;
        fit();
      }
    });
    observer.observe(parent);
    fit();
    void document.fonts.ready.then(fit);
    return () => observer.disconnect();
  }, [value]);
  return (
    <span ref={ref} className="fit-amount">
      {value}
    </span>
  );
}
function Modal({
  title,
  subtitle,
  children,
  close,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const focusable = ref.current?.querySelectorAll<HTMLElement>(
          'button, input, select, a[href], [tabindex="0"]',
        );
        if (!focusable?.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >
        <div className="modal-heading">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={close}
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Auth({
  onLogin,
  config,
  initialError,
}: {
  onLogin: (u: User) => void;
  config: AuthConfig;
  initialError: string;
}) {
  const [register, setRegister] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError),
    [currency, setCurrency] = useState("BDT");
  useEffect(() => {
    if (!config.registrationEnabled) setRegister(false);
  }, [config.registrationEnabled]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      onLogin(
        await api<User>(
          register ? "/auth/register" : "/auth/login",
          "POST",
          values,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="eyebrow light">
            <Leaf size={15} /> LESS WORRY. MORE LIVING.
          </span>
          <h1>
            A little closer
            <br />
            to <em>debt-free.</em>
          </h1>
          <p>
            Your loans, payments, and progress.
            <br />
            Finally, all in one calm place.
          </p>
          <div className="auth-example">
            <div className="row-between">
              <span className="small-label">YOUR NEXT CHAPTER</span>
              <Sparkles size={20} />
            </div>
            <h3>
              Big plans.
              <br />
              Smaller balances.
            </h3>
            <div className="example-bars">
              {[28, 42, 36, 59, 72, 87, 100].map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
            <span className="example-caption">
              Make room for what comes next.
            </span>
          </div>
        </div>
        <span className="auth-footer">
          <ShieldCheck size={16} /> Self-hosted. Your data stays on your server.
        </span>
      </section>
      <section className="auth-form">
        <div className="auth-form-inner">
          <span className="pill">
            <span className="live-dot" /> LOCAL WORKSPACE
          </span>
          <h2>
            {register ? "A fresh start for your finances." : "Welcome back."}
          </h2>
          <p>
            {register
              ? "Create your account and take the first step."
              : "Let’s see how your progress is coming along."}
          </p>
          <button
            className="google-button"
            disabled={!config.googleEnabled || busy}
            onClick={() =>
              window.location.assign(`/api/auth/google?currency=${currency}`)
            }
          >
            <GoogleMark />
            Continue with Google
          </button>
          {!config.googleEnabled && (
            <p className="google-unavailable">
              Google sign-in is not available yet.
            </p>
          )}
          <div className="auth-divider">
            <span>or use email</span>
          </div>
          <form onSubmit={submit}>
            {register && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Mahmud"
                  maxLength={60}
                  required
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                placeholder={
                  register ? "At least 10 characters" : "Your password"
                }
                minLength={register ? 10 : 1}
                maxLength={128}
                required
              />
            </label>
            {register && (
              <label>
                Account currency
                <select
                  name="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="BDT">BDT — Bangladeshi Taka</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="INR">INR — Indian Rupee</option>
                </select>
                <small>All loans in this account use this currency.</small>
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary auth-submit" disabled={busy}>
              {busy
                ? "One moment…"
                : register
                  ? "Create my account"
                  : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
          {config.registrationEnabled && (
            <p className="auth-switch">
              {register ? "Already have an account?" : "New to EMI Tracker?"}{" "}
              <button
                className="text-button"
                onClick={() => {
                  setRegister(!register);
                  setError("");
                }}
              >
                {register ? "Sign in" : "Create an account"}
              </button>
            </p>
          )}
          <p className="auth-note">
            <ShieldCheck size={16} /> No bank connection required. You’re in
            control.
          </p>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [authResult] = useState(
    () => new URLSearchParams(window.location.search).get("auth_result") || "",
  );
  const [authConfig, setAuthConfig] = useState<AuthConfig>({
    googleEnabled: false,
    registrationEnabled: true,
  });
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [loans, setLoans] = useState<Loan[]>([]);
  const [page, setPage] = useState<Page>(
      authResult === "linked" ? "Settings" : "Overview",
    ),
    [mobileNav, setMobileNav] = useState(false),
    [addLoan, setAddLoan] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const [payment, setPayment] = useState<{
      loan: Loan;
      number?: number;
    } | null>(null),
    [deleteLoan, setDeleteLoan] = useState<Loan | null>(null);
  const [toast, setToast] = useState(
      authResult === "linked" ? "Google account connected." : "",
    ),
    [error, setError] = useState(authMessages[authResult] || ""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("Upcoming");
  const [calculatorDefaults, setCalculatorDefaults] = useState<
    Partial<LoanInput> | undefined
  >();
  const today = dateISO(),
    currentMonth = today.slice(0, 7);
  const money = (cents: number, compact = false) =>
    new Intl.NumberFormat("en-BD", {
      style: "currency",
      currency: user?.currency ?? "BDT",
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: compact ? 0 : 2,
      minimumFractionDigits: compact ? 0 : 2,
    }).format(cents / 100);
  const reload = async () => setLoans(await api<Loan[]>("/loans"));
  useEffect(() => {
    api<AuthConfig>("/auth/config")
      .then(setAuthConfig)
      .catch(() => {});
    if (authResult) {
      const url = new URL(window.location.href);
      url.searchParams.delete("auth_result");
      window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash,
      );
    }
  }, [authResult]);
  useEffect(() => {
    api<User>("/me")
      .then(async (u) => {
        setUser(u);
        await reload();
      })
      .catch((e) => {
        if (!(e as Error).message.includes("sign in"))
          setError((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  async function action(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await reload();
      setToast(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const all = loans.flatMap((loan) =>
    loan.schedule.map((s) => ({ ...s, loan })),
  );
  const unpaid = all
    .filter((s) => !s.paidOn)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paid = all.filter((s) => s.paidOn);
  const overdue = unpaid.filter((s) => s.dueDate < today);
  const thisMonth = all.filter((s) => s.dueDate.startsWith(currentMonth));
  const active = loans.filter((l) => l.schedule.some((s) => !s.paidOn));
  const original = loans.reduce((n, l) => n + Math.round(l.principal * 100), 0);
  const repaid = paid.reduce((n, s) => n + s.principal, 0),
    outstanding = original - repaid;
  const progress = original ? Math.round((repaid / original) * 100) : 0;
  const currentLoan = loans.find((l) => l.id === selected);
  const nextDue = unpaid[0];
  function go(p: Page) {
    setPage(p);
    setMobileNav(false);
    setQuery("");
  }
  async function login(u: User) {
    setUser(u);
    setLoans([]);
    await reload().catch((e) => setError((e as Error).message));
  }
  if (loading)
    return (
      <div className="loading">
        <Brand />
        <span>Getting your workspace ready…</span>
      </div>
    );
  if (!user)
    return (
      <Auth
        onLogin={(u) => void login(u)}
        config={authConfig}
        initialError={authMessages[authResult] || ""}
      />
    );

  const renderLoan = (loan: Loan) => {
    const Icon = icons[loan.category as keyof typeof icons] ?? Wallet;
    const count = loan.schedule.filter((s) => s.paidOn).length,
      remaining = loan.schedule.find((s) => !s.paidOn);
    const value = loan.schedule
      .filter((s) => !s.paidOn)
      .reduce((n, s) => n + s.principal, 0);
    return (
      <button
        className="loan-card"
        key={loan.id}
        onClick={() => setSelected(loan.id)}
      >
        <div className="row-between">
          <span className={`category-icon ${loan.color}`}>
            <Icon size={21} />
          </span>
          <span
            className={`status ${!remaining ? "settled" : remaining.dueDate < today ? "overdue" : ""}`}
          >
            {!remaining
              ? "Completed"
              : remaining.dueDate < today
                ? "Overdue"
                : "Active"}
          </span>
        </div>
        <h3>{loan.name}</h3>
        <p>
          {loan.lender} <span>·</span> {loan.category} loan
        </p>
        <div className="loan-amount">
          <strong>{money(value, true)}</strong>
          <span>principal remaining</span>
        </div>
        <div className="progress-track">
          <i style={{ width: `${(count / loan.months) * 100}%` }} />
        </div>
        <div className="row-between loan-progress">
          <span>
            {count} of {loan.months} paid
          </span>
          <span>{Math.round((count / loan.months) * 100)}%</span>
        </div>
        <div className="loan-card-footer">
          <span>
            Monthly EMI <b>{money(loan.schedule[0].amount, true)}</b>
          </span>
          <ArrowUpRight size={17} />
        </div>
      </button>
    );
  };
  const renderPaymentRow = (
    s: Instalment & { loan: Loan },
    history = false,
  ) => {
    const Icon = icons[s.loan.category as keyof typeof icons] ?? Wallet;
    return (
      <tr key={`${s.loan.id}-${s.number}`}>
        <td>
          <div className="table-loan">
            <span className={`category-icon small ${s.loan.color}`}>
              <Icon size={17} />
            </span>
            <span>
              <b>{s.loan.name}</b>
              <small>
                Instalment {s.number} · {s.loan.lender}
              </small>
            </span>
          </div>
        </td>
        <td>{prettyDate(history ? s.paidOn! : s.dueDate)}</td>
        <td className="amount-cell">{money(s.amount)}</td>
        <td>
          <span
            className={`status ${s.paidOn ? "settled" : s.dueDate < today ? "overdue" : ""}`}
          >
            {s.paidOn ? "Paid" : s.dueDate < today ? "Overdue" : "Upcoming"}
          </span>
        </td>
        <td>
          {s.paidOn ? (
            <button
              className="text-button muted"
              disabled={busy}
              onClick={() =>
                void action(
                  () =>
                    api(`/loans/${s.loan.id}/payments/${s.number}`, "DELETE"),
                  "Payment undone.",
                )
              }
            >
              Undo
            </button>
          ) : (
            <button
              className="pay-button"
              onClick={() => setPayment({ loan: s.loan, number: s.number })}
            >
              Record <ArrowUpRight size={14} />
            </button>
          )}
        </td>
      </tr>
    );
  };
  return (
    <div className="app-layout">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <Brand />
        <button className="workspace" onClick={() => go("Settings")}>
          <span className="workspace-icon">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <b>Personal workspace</b>
            <small>{user.currency} account</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <span className="nav-label">YOUR WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navItems.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={page === name ? "active" : ""}
              aria-current={page === name ? "page" : undefined}
              onClick={() => go(name)}
            >
              <Icon size={19} />
              {name}
              {name === "My loans" && loans.length > 0 && (
                <span className="nav-count">{loans.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Leaf size={20} />
            </span>
            <h4>Small steps. Big freedom.</h4>
            <p>
              Every payment is progress.
              <br />
              You’ve got this.
            </p>
            <button onClick={() => go("EMI calculator")}>
              Plan your next step <ArrowRight size={14} />
            </button>
          </div>
          <button
            className={`sidebar-setting ${page === "Settings" ? "active" : ""}`}
            onClick={() => go("Settings")}
          >
            <Settings size={18} />
            Settings
          </button>
          <div className="profile">
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <b>{user.name}</b>
              <small>Personal account</small>
            </span>
            <button
              className="icon-btn"
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                try {
                  await api("/logout", "POST");
                  setUser(null);
                  setLoans([]);
                  setPage("Overview");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>{page}</b>
          </div>
          <div className="topbar-right">
            <span className="local-status">
              <i /> Local workspace
            </span>
            <button
              className="notification-btn"
              aria-label={`${overdue.length} overdue payments`}
              onClick={() => {
                go("Payments");
                setPaymentFilter("Overdue");
              }}
            >
              <Bell size={19} />
              {overdue.length > 0 && <i />}
            </button>
            <span className="avatar small">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="main-content">
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                className="icon-btn"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {page === "Overview"
                  ? `YOUR MONEY, AT A GLANCE`
                  : "A LITTLE MORE CLARITY"}
              </p>
              <h1>
                {page === "Overview"
                  ? `Hello, ${user.name.split(" ")[0]}.`
                  : page}
              </h1>
              <p>
                {
                  {
                    Overview: "Let’s make a little room for peace of mind.",
                    "My loans": "All your commitments. One clear picture.",
                    Payments: "Every instalment, accounted for.",
                    "EMI calculator":
                      "Make a plan before you make a commitment.",
                    Settings: "Make this workspace feel like yours.",
                  }[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {page === "Overview" && (
                <span className="today-date">
                  {new Date().toLocaleDateString("en-GB", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
              {(page === "Overview" || page === "My loans") && (
                <button
                  className="btn primary"
                  onClick={() => setAddLoan(true)}
                >
                  <Plus size={17} />
                  Add a loan
                </button>
              )}
              {page === "Payments" && (
                <a className="btn secondary" href="/api/export" download>
                  <ArrowDownToLine size={16} />
                  Export CSV
                </a>
              )}
            </div>
          </div>
          {page === "Overview" && (
            <>
              <section className="hero-panel">
                <div className="hero-copy">
                  <span className="eyebrow">
                    <span className="tiny-line" /> ONE PAYMENT AT A TIME
                  </span>
                  <h2>
                    A little closer
                    <br />
                    to <em>debt-free.</em>
                  </h2>
                  <p>
                    {loans.length ? (
                      <>
                        You’ve repaid <b>{money(repaid, true)}</b> in principal.
                        <br />
                        That’s progress worth feeling good about.
                      </>
                    ) : (
                      <>
                        Bring your loans together. See what’s ahead.
                        <br />
                        Build a little momentum, one payment at a time.
                      </>
                    )}
                  </p>
                  <button
                    className="hero-link"
                    onClick={() =>
                      loans.length ? go("My loans") : setAddLoan(true)
                    }
                  >
                    {loans.length
                      ? "See your progress"
                      : "Track your first loan"}
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="hero-art">
                  <div className="art-orbit orbit-one" />
                  <div className="art-orbit orbit-two" />
                  <div className="growth-line">
                    <svg viewBox="0 0 300 125" aria-hidden="true">
                      <path
                        d="M0 122 C40 120 32 90 75 91 S117 57 155 62 S190 30 221 35 S254 6 297 5"
                        fill="none"
                        stroke="#d2e7a9"
                        strokeWidth="3"
                      />
                      <circle cx="297" cy="5" r="5" fill="#d2e7a9" />
                    </svg>
                  </div>
                  <span className="art-sparkle">✳</span>
                  <div className="progress-float">
                    <span className="progress-check">
                      <Check size={17} />
                    </span>
                    <div>
                      <b>{progress}% of principal repaid</b>
                      <small>
                        {loans.length
                          ? "Keep your momentum going"
                          : "Your journey starts here"}
                      </small>
                    </div>
                  </div>
                  <div className="art-caption">
                    <Leaf size={15} /> ROOM TO GROW
                  </div>
                </div>
              </section>
              <section className="stats-grid" aria-label="Loan summary">
                <Stat
                  title="Outstanding principal"
                  value={money(outstanding, true)}
                  detail={`Across ${active.length} active ${active.length === 1 ? "loan" : "loans"}`}
                  icon={<Wallet size={18} />}
                />
                <Stat
                  title="Due this month"
                  value={money(
                    thisMonth
                      .filter((s) => !s.paidOn)
                      .reduce((n, s) => n + s.amount, 0),
                    true,
                  )}
                  detail={`${thisMonth.filter((s) => !s.paidOn).length} instalments remaining`}
                  icon={<CreditCard size={18} />}
                />
                <Stat
                  title="Total paid"
                  value={money(
                    paid.reduce((n, s) => n + s.amount, 0),
                    true,
                  )}
                  detail={`${paid.length} payments · includes interest`}
                  icon={<CheckCheck size={18} />}
                />
                <Stat
                  title="Overdue payments"
                  value={String(overdue.length).padStart(2, "0")}
                  detail={
                    overdue.length
                      ? `${money(
                          overdue.reduce((n, s) => n + s.amount, 0),
                          true,
                        )} to catch up on`
                      : "All caught up. Nicely done."
                  }
                  icon={<Activity size={18} />}
                  warning={overdue.length > 0}
                />
              </section>
              <div className="overview-middle">
                <section className="panel activity-panel">
                  <div className="section-heading">
                    <div>
                      <h2>Your payment rhythm</h2>
                      <p>A look at the last six months</p>
                    </div>
                    <span className="legend">
                      <i /> Amount paid
                    </span>
                  </div>
                  <PaymentChart payments={paid} money={money} />
                </section>
                <section className="panel next-payment">
                  <div className="section-heading">
                    <h2>Next on your list</h2>
                    <span className="soft-icon">
                      <CreditCard size={17} />
                    </span>
                  </div>
                  {nextDue ? (
                    <>
                      <span
                        className={`status ${nextDue.dueDate < today ? "overdue" : ""}`}
                      >
                        {nextDue.dueDate < today
                          ? "Overdue"
                          : "Upcoming payment"}
                      </span>
                      <h3>
                        <FitText value={money(nextDue.amount)} />
                      </h3>
                      <p>{nextDue.loan.name}</p>
                      <div className="next-date">
                        <span>Due date</span>
                        <b>{prettyDate(nextDue.dueDate)}</b>
                      </div>
                      <button
                        className="btn primary"
                        onClick={() =>
                          setPayment({
                            loan: nextDue.loan,
                            number: nextDue.number,
                          })
                        }
                      >
                        <Check size={16} />
                        Record payment
                      </button>
                      <small>Mark it paid after you’ve made the payment.</small>
                    </>
                  ) : (
                    <div className="next-empty">
                      <CheckCheck size={31} />
                      <h3>
                        {loans.length ? "All clear." : "A clear path ahead."}
                      </h3>
                      <p>
                        {loans.length
                          ? "Every instalment is paid. Enjoy the moment."
                          : "Add a loan to see your next payment here."}
                      </p>
                    </div>
                  )}
                </section>
              </div>
              <section>
                <div className="section-heading loans-heading">
                  <div>
                    <h2>
                      Your loans{" "}
                      <span className="count-badge">{loans.length}</span>
                    </h2>
                    <p>A clear view of where you stand</p>
                  </div>
                  {loans.length > 0 && (
                    <button
                      className="text-button"
                      onClick={() => go("My loans")}
                    >
                      View all loans <ArrowRight size={15} />
                    </button>
                  )}
                </div>
                {loans.length ? (
                  <div className="loans-grid">
                    {loans.slice(0, 3).map(renderLoan)}
                  </div>
                ) : (
                  <EmptyLoans
                    add={() => setAddLoan(true)}
                    sample={() =>
                      void action(
                        () => api("/sample", "POST"),
                        "Sample loans added. You can delete them any time.",
                      )
                    }
                    busy={busy}
                  />
                )}
              </section>
              {unpaid.length > 0 && (
                <section className="panel upcoming-panel">
                  <div className="section-heading">
                    <div>
                      <h2>Coming up next</h2>
                      <p>Your earliest unpaid instalments</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => go("Payments")}
                    >
                      All payments <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>LOAN</th>
                          <th>DUE DATE</th>
                          <th>AMOUNT</th>
                          <th>STATUS</th>
                          <th>
                            <span className="sr-only">Action</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {unpaid.slice(0, 4).map((s) => renderPaymentRow(s))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
          {page === "My loans" && (
            <>
              <div className="filter-bar">
                <div className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Search loans"
                    placeholder="Search loans or lenders…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <span>
                  {active.length} active · {loans.length - active.length}{" "}
                  completed
                </span>
              </div>
              {loans.length ? (
                <div className="loans-grid full">
                  {loans
                    .filter((l) =>
                      `${l.name} ${l.lender} ${l.category}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map(renderLoan)}
                  {!loans.some((l) =>
                    `${l.name} ${l.lender} ${l.category}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  ) && (
                    <p className="empty-message">No loans match your search.</p>
                  )}
                </div>
              ) : (
                <EmptyLoans
                  add={() => setAddLoan(true)}
                  sample={() =>
                    void action(
                      () => api("/sample", "POST"),
                      "Sample loans added.",
                    )
                  }
                  busy={busy}
                />
              )}
            </>
          )}
          {page === "Payments" && (
            <section className="panel">
              <div className="payments-toolbar">
                <div className="tabs">
                  {["Upcoming", "Overdue", "Paid"].map((f) => (
                    <button
                      key={f}
                      className={paymentFilter === f ? "active" : ""}
                      onClick={() => setPaymentFilter(f)}
                    >
                      {f}{" "}
                      <span>
                        {f === "Paid"
                          ? paid.length
                          : f === "Overdue"
                            ? overdue.length
                            : unpaid.filter((s) => s.dueDate >= today).length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>LOAN</th>
                      <th>
                        {paymentFilter === "Paid" ? "PAID ON" : "DUE DATE"}
                      </th>
                      <th>AMOUNT</th>
                      <th>STATUS</th>
                      <th>
                        <span className="sr-only">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(paymentFilter === "Paid"
                      ? [...paid].sort((a, b) =>
                          b.paidOn!.localeCompare(a.paidOn!),
                        )
                      : paymentFilter === "Overdue"
                        ? overdue
                        : unpaid.filter((s) => s.dueDate >= today)
                    ).map((s) => renderPaymentRow(s, paymentFilter === "Paid"))}
                  </tbody>
                </table>
              </div>
              {!(
                paymentFilter === "Paid"
                  ? paid
                  : paymentFilter === "Overdue"
                    ? overdue
                    : unpaid.filter((s) => s.dueDate >= today)
              ).length && (
                <div className="empty-message">
                  <CheckCheck size={29} />
                  <h3>
                    {paymentFilter === "Overdue"
                      ? "You’re all caught up."
                      : "Nothing here yet."}
                  </h3>
                  <p>
                    {paymentFilter === "Paid"
                      ? "Recorded payments will appear here."
                      : "Your instalments will appear here when there’s something to track."}
                  </p>
                </div>
              )}
            </section>
          )}
          {page === "EMI calculator" && (
            <CalculatorPage
              money={money}
              currency={user.currency}
              add={(values) => {
                setAddLoan(true);
                setCalculatorDefaults(values);
              }}
            />
          )}
          {page === "Settings" && (
            <SettingsPage
              user={user}
              googleEnabled={authConfig.googleEnabled}
              connectGoogle={async () => {
                try {
                  const { url } = await api<{ url: string }>(
                    "/me/google",
                    "POST",
                  );
                  window.location.assign(url);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
              hasLoans={loans.length > 0}
              save={async (values) => {
                try {
                  const u = await api<User>("/me", "PATCH", values);
                  setUser(u);
                  setToast("Workspace settings saved.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={14} /> A little progress, every month.
            </span>
            <span>
              EMI Tracker <span className="footer-dot">·</span> Your money. Your
              server.
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {navItems.map(({ name, icon: Icon }) => (
          <button
            key={name}
            aria-current={page === name ? "page" : undefined}
            className={page === name ? "active" : ""}
            onClick={() => go(name)}
          >
            <Icon size={21} />
            <span>
              {name === "EMI calculator"
                ? "Calculator"
                : name === "My loans"
                  ? "Loans"
                  : name === "Overview"
                    ? "Home"
                    : name}
            </span>
          </button>
        ))}
        <button
          className={page === "Settings" ? "active" : ""}
          onClick={() => go("Settings")}
          aria-current={page === "Settings" ? "page" : undefined}
        >
          <Settings size={21} />
          <span>Settings</span>
        </button>
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            className="icon-btn"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {addLoan && (
        <LoanForm
          defaults={calculatorDefaults}
          money={money}
          currency={user.currency}
          close={() => {
            setAddLoan(false);
            setCalculatorDefaults(undefined);
          }}
          save={async (values) => {
            if (
              await action(
                () => api("/loans", "POST", values),
                "Your loan is ready to track.",
              )
            ) {
              setAddLoan(false);
              setCalculatorDefaults(undefined);
            }
          }}
          busy={busy}
        />
      )}
      {currentLoan && !payment && !deleteLoan && (
        <Modal
          title={currentLoan.name}
          subtitle={`${currentLoan.lender} · ${currentLoan.annualRate}% annual interest · ${currentLoan.months} months`}
          close={() => setSelected(null)}
          wide
        >
          <div className="detail-stats">
            <div>
              <small>Original principal</small>
              <b>{money(Math.round(currentLoan.principal * 100))}</b>
            </div>
            <div>
              <small>Monthly EMI</small>
              <b>{money(currentLoan.schedule[0].amount)}</b>
            </div>
            <div>
              <small>Total scheduled interest</small>
              <b>
                {money(
                  currentLoan.schedule.reduce((n, s) => n + s.interest, 0),
                )}
              </b>
            </div>
          </div>
          <div className="section-heading schedule-heading">
            <h3>Payment schedule</h3>
            <button
              className="text-button danger"
              onClick={() => setDeleteLoan(currentLoan)}
            >
              <Trash2 size={15} />
              Delete loan
            </button>
          </div>
          <p className="schedule-note">
            Reducing-balance estimate. Final instalment adjusts for rounding.
            Your lender’s schedule may differ.
          </p>
          <div className="table-scroll schedule-table">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>DUE DATE</th>
                  <th>PRINCIPAL</th>
                  <th>INTEREST</th>
                  <th>EMI</th>
                  <th>PAYMENT</th>
                </tr>
              </thead>
              <tbody>
                {currentLoan.schedule.map((s) => (
                  <tr key={s.number}>
                    <td>{s.number}</td>
                    <td>{prettyDate(s.dueDate)}</td>
                    <td>{money(s.principal)}</td>
                    <td>{money(s.interest)}</td>
                    <td className="amount-cell">{money(s.amount)}</td>
                    <td>
                      {s.paidOn ? (
                        <button
                          className="text-button paid-link"
                          disabled={busy}
                          title={`Paid on ${prettyDate(s.paidOn)}. Click to undo.`}
                          onClick={() =>
                            void action(
                              () =>
                                api(
                                  `/loans/${currentLoan.id}/payments/${s.number}`,
                                  "DELETE",
                                ),
                              "Payment undone.",
                            )
                          }
                        >
                          <Check size={14} />
                          Paid · undo
                        </button>
                      ) : (
                        <button
                          className="pay-button"
                          onClick={() =>
                            setPayment({ loan: currentLoan, number: s.number })
                          }
                        >
                          Record <Plus size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
      {payment && (
        <PaymentForm
          loan={payment.loan}
          initialNumber={payment.number}
          money={money}
          close={() => setPayment(null)}
          busy={busy}
          save={async (n, paidOn) => {
            if (
              await action(
                () =>
                  api(`/loans/${payment.loan.id}/payments/${n}`, "PUT", {
                    paidOn,
                  }),
                "Payment recorded. One step closer!",
              )
            )
              setPayment(null);
          }}
        />
      )}
      {deleteLoan && (
        <Modal
          title="Delete this loan?"
          subtitle="This also removes its recorded payment history."
          close={() => setDeleteLoan(null)}
        >
          <p className="delete-copy">
            Remove <b>{deleteLoan.name}</b> and all {deleteLoan.months}{" "}
            scheduled instalments? This cannot be undone.
          </p>
          <div className="form-actions">
            <button
              className="btn secondary"
              onClick={() => setDeleteLoan(null)}
            >
              Keep loan
            </button>
            <button
              className="btn destructive"
              disabled={busy}
              onClick={async () => {
                if (
                  await action(
                    () => api(`/loans/${deleteLoan.id}`, "DELETE"),
                    "Loan deleted.",
                  )
                ) {
                  setDeleteLoan(null);
                  setSelected(null);
                }
              }}
            >
              Delete loan
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({
  title,
  value,
  detail,
  icon,
  warning = false,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
  warning?: boolean;
}) {
  return (
    <div className={`stat-card ${warning ? "warning" : ""}`}>
      <div className="row-between">
        <span>{title}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>
        <FitText value={value} />
      </strong>
      <small>
        {title === "Total paid" && <ArrowDownLeft size={13} />} {detail}
      </small>
    </div>
  );
}
function PaymentChart({
  payments,
  money,
}: {
  payments: Instalment[];
  money: (n: number, compact?: boolean) => string;
}) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const key = dateISO(d).slice(0, 7);
    return {
      label: d.toLocaleDateString("en-GB", { month: "short" }),
      value: payments
        .filter((p) => p.paidOn?.startsWith(key))
        .reduce((n, p) => n + p.amount, 0),
    };
  });
  const max = Math.max(...months.map((m) => m.value), 10000);
  return (
    <div className="chart">
      <div className="chart-axis">
        <span>{money(max, true)}</span>
        <span>{money(max / 2, true)}</span>
        <span>0</span>
      </div>
      <div className="chart-plot">
        <div className="chart-grid">
          <i />
          <i />
          <i />
        </div>
        <div className="chart-bars">
          {months.map((m, i) => (
            <div key={m.label} className="chart-column">
              <div
                className={`chart-bar ${i === 5 ? "current" : ""}`}
                style={{
                  height: `${m.value ? Math.max((m.value / max) * 100, 3) : 2}%`,
                }}
                tabIndex={0}
                aria-label={`${m.label}: ${money(m.value)} paid`}
              >
                <span className="chart-tooltip">{money(m.value, true)}</span>
              </div>
              <span className="chart-month">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function EmptyLoans({
  add,
  sample,
  busy,
}: {
  add: () => void;
  sample: () => void;
  busy: boolean;
}) {
  return (
    <div className="empty-loans">
      <span className="empty-icon">
        <Wallet size={26} />
      </span>
      <h3>Your fresh start begins here.</h3>
      <p>Add your first loan, or explore the workspace with sample data.</p>
      <div>
        <button className="btn primary" onClick={add}>
          <Plus size={16} />
          Add your first loan
        </button>
        <button className="btn secondary" disabled={busy} onClick={sample}>
          <Sparkles size={15} />
          Explore sample loans
        </button>
      </div>
      <small>
        Sample loans are clearly fictional and can be deleted any time.
      </small>
    </div>
  );
}
function LoanForm({
  defaults,
  money,
  currency,
  close,
  save,
  busy,
}: {
  defaults?: Partial<LoanInput>;
  money: (n: number) => string;
  currency: string;
  close: () => void;
  save: (v: LoanInput) => Promise<void>;
  busy: boolean;
}) {
  const [principal, setPrincipal] = useState(defaults?.principal ?? 500000),
    [rate, setRate] = useState(defaults?.annualRate ?? 10),
    [months, setMonths] = useState(defaults?.months ?? 36);
  const estimated =
    principal >= 1 && months >= 1 && months <= 600 && rate >= 0 && rate <= 60
      ? schedule({
          principal,
          annualRate: rate,
          months,
          firstDue: dateISO(),
        })[0].amount
      : 0;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    await save({
      ...d,
      principal: Number(d.principal),
      annualRate: Number(d.annualRate),
      months: Number(d.months),
    } as LoanInput);
  }
  return (
    <Modal
      title="Make room for a clearer picture."
      subtitle="Add a loan and we’ll work out your payment schedule."
      close={close}
    >
      <form onSubmit={submit} className="loan-form">
        <label>
          Loan name
          <input
            name="name"
            placeholder="e.g. My home loan"
            required
            maxLength={80}
            autoFocus
          />
        </label>
        <div className="form-grid">
          <label>
            Lender
            <input
              name="lender"
              placeholder="Bank or lender name"
              required
              maxLength={80}
            />
          </label>
          <label>
            Loan type
            <select name="category" defaultValue="Personal">
              {Object.keys(icons).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Loan amount ({currency})
            <input
              name="principal"
              type="number"
              min="1"
              max="1000000000"
              step="0.01"
              value={principal || ""}
              onChange={(e) => setPrincipal(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Annual interest rate (%)
            <input
              name="annualRate"
              type="number"
              min="0"
              max="60"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Tenure (months)
            <input
              name="months"
              type="number"
              min="1"
              max="600"
              step="1"
              value={months || ""}
              onChange={(e) => setMonths(Number(e.target.value))}
              required
            />
          </label>
          <label>
            First instalment due
            <input
              name="firstDue"
              type="date"
              defaultValue={dateISO()}
              min="2000-01-01"
              max="2100-12-31"
              required
            />
          </label>
        </div>
        <label>
          Card colour
          <select name="color" defaultValue="sage">
            <option value="sage">Sage green</option>
            <option value="blue">Sky blue</option>
            <option value="peach">Warm peach</option>
            <option value="lavender">Soft lavender</option>
          </select>
        </label>
        <div className="emi-estimate">
          <span>Estimated monthly EMI</span>
          <strong>{money(estimated)}</strong>
        </div>
        <p className="schedule-note">
          Fixed-rate, reducing-balance estimate. Excludes fees, insurance and
          penalties. The final instalment may vary slightly.
        </p>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Add loan"}
            <Plus size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PaymentForm({
  loan,
  initialNumber,
  money,
  close,
  save,
  busy,
}: {
  loan: Loan;
  initialNumber?: number;
  money: (n: number) => string;
  close: () => void;
  save: (n: number, d: string) => Promise<void>;
  busy: boolean;
}) {
  const [number, setNumber] = useState(
    initialNumber ?? loan.schedule.find((s) => !s.paidOn)!.number,
  );
  return (
    <Modal
      title="One step closer."
      subtitle={`Record a payment for ${loan.name}.`}
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void save(number, d.get("paidOn") as string);
        }}
      >
        <label>
          Instalment
          <select
            value={number}
            onChange={(e) => setNumber(Number(e.target.value))}
          >
            {loan.schedule
              .filter((s) => !s.paidOn)
              .map((s) => (
                <option key={s.number} value={s.number}>
                  #{s.number} · {prettyDate(s.dueDate)} · {money(s.amount)}
                </option>
              ))}
          </select>
        </label>
        <label>
          Payment date
          <input
            name="paidOn"
            type="date"
            defaultValue={dateISO()}
            max={dateISO()}
            required
          />
        </label>
        <div className="emi-estimate">
          <span>Instalment amount</span>
          <strong>{money(loan.schedule[number - 1].amount)}</strong>
        </div>
        <p className="schedule-note">
          This records a full instalment you’ve already paid. No money is
          transferred.
        </p>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            <Check size={16} />
            {busy ? "Saving…" : "Confirm payment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function CalculatorPage({
  money,
  currency,
  add,
}: {
  money: (n: number, compact?: boolean) => string;
  currency: string;
  add: (v: Partial<LoanInput>) => void;
}) {
  const [principal, setPrincipal] = useState(500000),
    [rate, setRate] = useState(10),
    [months, setMonths] = useState(36);
  const valid =
    principal >= 1 &&
    principal <= 1e9 &&
    rate >= 0 &&
    rate <= 60 &&
    Number.isInteger(months) &&
    months >= 1 &&
    months <= 600;
  const rows = valid
    ? schedule({ principal, annualRate: rate, months, firstDue: dateISO() })
    : [];
  const total = rows.reduce((n, s) => n + s.amount, 0),
    interest = rows.reduce((n, s) => n + s.interest, 0);
  return (
    <div className="calculator-grid">
      <section className="panel calculator-inputs">
        <span className="category-icon sage">
          <Calculator size={24} />
        </span>
        <h2>What does your plan look like?</h2>
        <p>Try different amounts, rates, and tenures.</p>
        <label>
          Loan amount ({currency})
          <input
            type="number"
            min="1"
            max="1000000000"
            step="0.01"
            value={principal || ""}
            onChange={(e) => setPrincipal(Number(e.target.value))}
          />
        </label>
        <label>
          Annual interest rate (%)
          <input
            type="number"
            min="0"
            max="60"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </label>
        <label>
          Tenure (months)
          <input
            type="number"
            min="1"
            max="600"
            value={months || ""}
            onChange={(e) => setMonths(Number(e.target.value))}
          />
        </label>
        {!valid && (
          <p className="form-error">
            Enter a positive amount, a rate of 0–60%, and a tenure of 1–600
            whole months.
          </p>
        )}
      </section>
      <section className="panel calculator-result">
        <span className="eyebrow">YOUR ESTIMATED MONTHLY EMI</span>
        <h2>
          <FitText value={money(rows[0]?.amount ?? 0)} />
        </h2>
        <div
          className="donut"
          style={{
            background: `conic-gradient(#284f40 0% ${total ? ((principal * 100) / total) * 100 : 0}%, #dbe9bd 0% 100%)`,
          }}
        >
          <div>
            <span>{months || 0}</span>
            <small>monthly payments</small>
          </div>
        </div>
        <div className="calculator-breakdown">
          <div>
            <span>
              <i />
              Principal amount
            </span>
            <b>{money(Math.round(principal * 100))}</b>
          </div>
          <div>
            <span>
              <i className="interest-dot" />
              Total interest
            </span>
            <b>{money(interest)}</b>
          </div>
          <div className="total">
            <span>Total repayment</span>
            <b>{money(total)}</b>
          </div>
        </div>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => add({ principal, annualRate: rate, months })}
        >
          Track this as a loan
          <ArrowRight size={16} />
        </button>
        <p className="schedule-note">
          A reducing-balance estimate with a fixed annual rate. Fees, taxes and
          insurance are excluded. Check the actual terms with your lender.
        </p>
      </section>
    </div>
  );
}
function SettingsPage({
  user,
  googleEnabled,
  connectGoogle,
  hasLoans,
  save,
}: {
  user: User;
  googleEnabled: boolean;
  connectGoogle: () => Promise<void>;
  hasLoans: boolean;
  save: (v: { name: string; currency: string }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <h2>Your workspace</h2>
        <p>Keep your account details up to date.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            setBusy(true);
            try {
              await save({
                name: d.get("name") as string,
                currency: (d.get("currency") as string) || user.currency,
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Your name
            <input
              name="name"
              defaultValue={user.name}
              required
              maxLength={60}
            />
          </label>
          <label>
            Email address
            <input type="email" value={user.email} disabled />
            <small>Your sign-in email cannot be changed here.</small>
          </label>
          <label>
            Account currency
            <select
              name="currency"
              defaultValue={user.currency}
              disabled={hasLoans}
            >
              {["BDT", "USD", "EUR", "GBP", "INR"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <small>
              {hasLoans
                ? "Currency is locked while loans exist to keep your amounts consistent."
                : "Choose a currency before adding loans."}
            </small>
          </label>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>
      <section className="panel privacy-panel">
        <div className="google-connection">
          <h2>Google sign-in</h2>
          <p>
            {user.googleConnected
              ? "Your Google account is connected. You can use it to sign in to this workspace."
              : "Connect Google to sign in to this workspace without typing a password."}
          </p>
          {user.googleConnected ? (
            <span className="status settled">
              <Check size={14} /> Connected
            </span>
          ) : (
            <>
              <button
                className="google-button"
                disabled={!googleEnabled || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await connectGoogle();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <GoogleMark />
                Connect Google
              </button>
              {!googleEnabled && (
                <p className="google-unavailable">
                  Google sign-in is not available yet.
                </p>
              )}
            </>
          )}
        </div>
        <ShieldCheck size={28} />
        <h2>Your data, close to home.</h2>
        <p>
          Your account, loans, and payment history are stored in this app’s
          local SQLite database.
        </p>
        <p>
          Download a CSV of your loan schedules and recorded payments whenever
          you need it.
        </p>
        <a href="/api/export" download className="btn secondary">
          <ArrowDownToLine size={16} />
          Export my data
        </a>
        <div className="settings-note">
          <CircleHelp size={18} />
          <p>
            EMI Tracker records full instalments manually. Bank syncing, partial
            payments, email reminders, password recovery, and subscription
            billing are outside this first version.
          </p>
        </div>
      </section>
    </div>
  );
}
