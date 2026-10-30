export type LoanInput = {
  name: string;
  lender: string;
  category: string;
  principal: number;
  annualRate: number;
  months: number;
  firstDue: string;
  color: string;
};
export type Instalment = {
  number: number;
  dueDate: string;
  amount: number;
  principal: number;
  interest: number;
  balance: number;
  paidOn: string | null;
};
export type Loan = LoanInput & { id: string; schedule: Instalment[] };

// Currency values in a schedule are integer minor units; input principal is in major units.
export function schedule(
  input: Pick<LoanInput, "principal" | "annualRate" | "months" | "firstDue">,
): Instalment[] {
  const total = Math.round(input.principal * 100);
  const rate = input.annualRate / 1200;
  const emi =
    rate === 0
      ? Math.round(total / input.months)
      : Math.round((total * rate) / (1 - Math.pow(1 + rate, -input.months)));
  const [year, month, day] = input.firstDue.split("-").map(Number);
  let balance = total;
  return Array.from({ length: input.months }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    const interest = Math.round(balance * rate);
    const principal =
      index === input.months - 1
        ? balance
        : Math.max(0, Math.min(balance, emi - interest));
    balance -= principal;
    return {
      number: index + 1,
      dueDate: date.toISOString().slice(0, 10),
      amount: principal + interest,
      principal,
      interest,
      balance,
      paidOn: null,
    };
  });
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
