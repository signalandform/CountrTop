import type { GetServerSideProps } from 'next';
import { useState, useEffect, useCallback } from 'react';
import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';
import { VendorAdminLayout } from '../../../components/VendorAdminLayout';
import type { Vendor } from '@countrtop/models';
import type { TimeEntry } from '@countrtop/models';

type TimeEntryWithName = TimeEntry & { employeeName: string };

type EmployeeSummary = { id: string; name: string; pin: string; isActive: boolean };

type VendorReportsPageProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(d);
};

const formatDuration = (clockInAt: string, clockOutAt: string | null) => {
  if (!clockOutAt) return '—';
  const start = new Date(clockInAt).getTime();
  const end = new Date(clockOutAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return '—';
  const mins = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

export const getServerSideProps: GetServerSideProps<VendorReportsPageProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  const authResult = await requireVendorAdmin(context, slug ?? null);
  if (!authResult.authorized) {
    if (authResult.redirect) {
      return { redirect: authResult.redirect };
    }
    return {
      props: {
        vendorSlug: slug ?? 'unknown',
        vendorName: 'Access Denied',
        vendor: null
      }
    };
  }

  const dataClient = getServerDataClient();
  const vendor = slug ? await dataClient.getVendorBySlug(slug) : null;

  return {
    props: {
      vendorSlug: slug ?? 'unknown',
      vendorName: vendor?.displayName ?? 'Unknown Vendor',
      vendor: vendor ?? null
    }
  };
};

export default function VendorReportsPage({ vendorSlug, vendorName, vendor }: VendorReportsPageProps) {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [activeEntries, setActiveEntries] = useState<TimeEntryWithName[]>([]);
  const [activeLoading, setActiveLoading] = useState(true);
  const [timesheetEntries, setTimesheetEntries] = useState<TimeEntryWithName[]>([]);
  const [timesheetLoading, setTimesheetLoading] = useState(true);
  const [timesheetStart, setTimesheetStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [timesheetEnd, setTimesheetEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [timesheetEmployeeId, setTimesheetEmployeeId] = useState<string>('');

  const fetchActive = useCallback(async () => {
    if (!vendorSlug) return;
    setActiveLoading(true);
    try {
      const [activeRes, employeesRes] = await Promise.all([
        fetch(`/api/vendors/${vendorSlug}/time-entries/active`, { credentials: 'include' }),
        fetch(`/api/vendors/${vendorSlug}/employees`, { credentials: 'include' })
      ]);
      const activeData = await activeRes.json();
      const employeesData = await employeesRes.json();
      if (activeData.success) setActiveEntries(activeData.data);
      if (employeesData.success) setEmployees(employeesData.data);
    } catch (err) {
      console.error('Failed to fetch active status', err);
    } finally {
      setActiveLoading(false);
    }
  }, [vendorSlug]);

  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  useEffect(() => {
    if (!vendorSlug) return;
    const interval = setInterval(fetchActive, 60000);
    return () => clearInterval(interval);
  }, [vendorSlug, fetchActive]);

  const loadTimesheet = useCallback(async () => {
    if (!vendorSlug) return;
    setTimesheetLoading(true);
    try {
      const params = new URLSearchParams({
        start: new Date(timesheetStart).toISOString(),
        end: new Date(timesheetEnd + 'T23:59:59.999Z').toISOString()
      });
      if (timesheetEmployeeId) params.set('employeeId', timesheetEmployeeId);
      const res = await fetch(
        `/api/vendors/${vendorSlug}/time-entries?${params.toString()}`,
        { credentials: 'include' }
      );
      const data = await res.json();
      if (data.success) setTimesheetEntries(data.data);
      else setTimesheetEntries([]);
    } catch (err) {
      console.error('Failed to fetch timesheet', err);
      setTimesheetEntries([]);
    } finally {
      setTimesheetLoading(false);
    }
  }, [vendorSlug, timesheetStart, timesheetEnd, timesheetEmployeeId]);

  useEffect(() => {
    loadTimesheet();
  }, [loadTimesheet]);

  const activeByEmployeeId = new Map(activeEntries.map((e) => [e.employeeId, e]));

  if (!vendor) {
    return (
      <VendorAdminLayout vendorSlug={vendorSlug} vendorName={vendorName}>
        <main className="page">
          <div className="container">
            <p>Vendor not found</p>
          </div>
        </main>
      </VendorAdminLayout>
    );
  }

  return (
    <VendorAdminLayout
      vendorSlug={vendorSlug}
      vendorName={vendorName}
      vendorLogoUrl={vendor.logoUrl ?? undefined}
    >
      <main className="page">
        <div className="container">
          <h1 className="page-title">Reports</h1>

          <section className="report-section ct-card">
            <h2 className="section-title">Who&apos;s clocked in</h2>
            <div className="live-actions">
              <button type="button" className="btn-refresh" onClick={fetchActive} disabled={activeLoading}>
                {activeLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            {activeLoading && employees.length === 0 ? (
              <p className="muted">Loading…</p>
            ) : (
              <ul className="status-list">
                {employees
                  .filter((e) => e.isActive)
                  .map((emp) => {
                    const active = activeByEmployeeId.get(emp.id);
                    return (
                      <li key={emp.id} className="status-item">
                        <span className="employee-name">{emp.name}</span>
                        {active ? (
                          <span className="status-badge clocked-in">
                            Clocked in at {formatDateTime(active.clockInAt)}
                          </span>
                        ) : (
                          <span className="status-badge clocked-out">Clocked out</span>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
            {!activeLoading && employees.filter((e) => e.isActive).length === 0 && (
              <p className="muted">No active employees. Add employees on the Team page.</p>
            )}
          </section>

          <section className="report-section ct-card">
            <h2 className="section-title">Timesheet</h2>
            <div className="timesheet-controls">
              <label>
                <span className="label-text">Start</span>
                <input
                  type="date"
                  value={timesheetStart}
                  onChange={(e) => setTimesheetStart(e.target.value)}
                  className="form-input"
                />
              </label>
              <label>
                <span className="label-text">End</span>
                <input
                  type="date"
                  value={timesheetEnd}
                  onChange={(e) => setTimesheetEnd(e.target.value)}
                  className="form-input"
                />
              </label>
              <label>
                <span className="label-text">Employee</span>
                <select
                  value={timesheetEmployeeId}
                  onChange={(e) => setTimesheetEmployeeId(e.target.value)}
                  className="form-input"
                >
                  <option value="">All employees</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn-load"
                onClick={loadTimesheet}
                disabled={timesheetLoading}
              >
                {timesheetLoading ? 'Loading…' : 'Load'}
              </button>
            </div>
            {timesheetLoading ? (
              <p className="muted">Loading timesheet…</p>
            ) : timesheetEntries.length === 0 ? (
              <p className="muted">No time entries for this range.</p>
            ) : (
              <div className="table-wrap">
                <table className="timesheet-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Clock in</th>
                      <th>Clock out</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timesheetEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.employeeName}</td>
                        <td>{formatDateTime(entry.clockInAt)}</td>
                        <td>{entry.clockOutAt ? formatDateTime(entry.clockOutAt) : '—'}</td>
                        <td>{formatDuration(entry.clockInAt, entry.clockOutAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
            padding: 32px;
          }

          .container {
            max-width: 1200px;
            margin: 0 auto;
          }

          .page-title {
            margin: 0 0 24px;
            font-size: 24px;
            font-weight: 700;
          }

          .report-section {
            padding: 24px;
            border-radius: var(--ct-card-border-radius, 20px);
            margin-bottom: 24px;
          }

          .section-title {
            margin: 0 0 16px;
            font-size: 18px;
            font-weight: 600;
          }

          .live-actions {
            margin-bottom: 12px;
          }

          .btn-refresh {
            padding: 8px 16px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface-warm);
            font-weight: 500;
            cursor: pointer;
          }

          .btn-refresh:hover:not(:disabled) {
            background: var(--color-bg-warm);
          }

          .btn-refresh:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }

          .status-list {
            list-style: none;
            margin: 0;
            padding: 0;
          }

          .status-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid var(--color-border);
          }

          .status-item:last-child {
            border-bottom: none;
          }

          .employee-name {
            font-weight: 500;
          }

          .status-badge {
            font-size: 13px;
            padding: 4px 10px;
            border-radius: 8px;
          }

          .status-badge.clocked-in {
            background: rgba(16, 185, 129, 0.12);
            color: var(--ct-success);
          }

          .status-badge.clocked-out {
            background: rgba(100, 116, 139, 0.12);
            color: var(--ct-text-muted);
          }

          .timesheet-controls {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            align-items: flex-end;
            margin-bottom: 20px;
          }

          .timesheet-controls label {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .label-text {
            font-size: 12px;
            font-weight: 600;
            color: var(--ct-text-muted);
          }

          .form-input {
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            font-size: 14px;
            min-width: 140px;
          }

          .btn-load {
            padding: 8px 20px;
            border-radius: 8px;
            border: none;
            background: var(--ct-gradient-primary);
            color: #fff;
            font-weight: 600;
            cursor: pointer;
          }

          .btn-load:hover:not(:disabled) {
            opacity: 0.9;
          }

          .btn-load:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .table-wrap {
            overflow-x: auto;
          }

          .timesheet-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          }

          .timesheet-table th,
          .timesheet-table td {
            padding: 10px 12px;
            text-align: left;
            border-bottom: 1px solid var(--color-border);
          }

          .timesheet-table th {
            font-weight: 600;
            color: var(--ct-text-muted);
          }

          .muted {
            margin: 0;
            color: var(--ct-text-muted);
            font-size: 14px;
          }

          @media (max-width: 768px) {
            .page {
              padding: 16px;
            }
            .container {
              max-width: 100%;
            }
            .timesheet-controls {
              flex-direction: column;
              align-items: stretch;
            }
          }
        `}</style>
      </main>
    </VendorAdminLayout>
  );
}
