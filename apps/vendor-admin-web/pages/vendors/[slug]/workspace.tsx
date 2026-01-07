import type { GetServerSideProps } from 'next';
import { useState, useEffect } from 'react';
import { requireVendorAdmin } from '../../../lib/auth';
import { getServerDataClient } from '../../../lib/dataClient';
import type { Vendor } from '@countrtop/models';
import type { Employee } from '@countrtop/models';

type WorkspacePageProps = {
  vendorSlug: string;
  vendorName: string;
  vendor: Vendor | null;
};

export const getServerSideProps: GetServerSideProps<WorkspacePageProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  // Check vendor admin access
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

export default function WorkspacePage({ vendorSlug, vendorName, vendor }: WorkspacePageProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeePin, setNewEmployeePin] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPin, setEditPin] = useState('');

  useEffect(() => {
    fetchEmployees();
  }, [vendorSlug]);

  const fetchEmployees = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/employees`, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setEmployees(data.data.map((emp: { id: string; name: string; pin: string; isActive: boolean }) => ({
          id: emp.id,
          vendorId: vendor?.id || '',
          name: emp.name,
          pin: emp.pin,
          isActive: emp.isActive,
          createdAt: '',
          updatedAt: ''
        })));
      } else {
        setError(data.error || 'Failed to load employees');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeName.trim() || !newEmployeePin.trim()) {
      setError('Name and PIN are required');
      return;
    }

    if (!/^\d{3}$/.test(newEmployeePin)) {
      setError('PIN must be exactly 3 digits');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: newEmployeeName.trim(),
          pin: newEmployeePin.trim()
        })
      });

      const data = await response.json();
      if (data.success) {
        setNewEmployeeName('');
        setNewEmployeePin('');
        setShowAddForm(false);
        await fetchEmployees();
      } else {
        setError(data.error || 'Failed to create employee');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create employee');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateEmployee = async (employeeId: string) => {
    if (!editName.trim() || !editPin.trim()) {
      setError('Name and PIN are required');
      return;
    }

    if (!/^\d{3}$/.test(editPin)) {
      setError('PIN must be exactly 3 digits');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/employees?employeeId=${employeeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: editName.trim(),
          pin: editPin.trim()
        })
      });

      const data = await response.json();
      if (data.success) {
        setEditingEmployee(null);
        setEditName('');
        setEditPin('');
        await fetchEmployees();
      } else {
        setError(data.error || 'Failed to update employee');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update employee');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!confirm('Are you sure you want to delete this employee? This action cannot be undone.')) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/employees?employeeId=${employeeId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await response.json();
      if (data.success) {
        await fetchEmployees();
      } else {
        setError(data.error || 'Failed to delete employee');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete employee');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (employeeId: string, isActive: boolean) => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/vendors/${vendorSlug}/employees?employeeId=${employeeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          isActive: !isActive
        })
      });

      const data = await response.json();
      if (data.success) {
        await fetchEmployees();
      } else {
        setError(data.error || 'Failed to update employee');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update employee');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (employee: Employee) => {
    setEditingEmployee(employee.id);
    setEditName(employee.name);
    setEditPin(employee.pin);
  };

  const cancelEdit = () => {
    setEditingEmployee(null);
    setEditName('');
    setEditPin('');
  };

  if (!vendor) {
    return (
      <main className="page">
        <div className="container">
          <p>Vendor not found</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="container">
        <header className="page-header">
          <div className="header-top">
            <a href={`/vendors/${vendorSlug}`} className="back-link">
              ← Back to Dashboard
            </a>
          </div>
          <h1>{vendorName}</h1>
          <p>Workspace</p>
        </header>

        <section className="workspace-section">
          <div className="section-header">
            <h2>Time Sheet</h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="btn-add-employee"
            >
              {showAddForm ? 'Cancel' : '+ Add Employee'}
            </button>
          </div>

          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          {showAddForm && (
            <form onSubmit={handleAddEmployee} className="add-employee-form">
              <div className="form-group">
                <label htmlFor="new-employee-name">Name</label>
                <input
                  id="new-employee-name"
                  type="text"
                  value={newEmployeeName}
                  onChange={(e) => setNewEmployeeName(e.target.value)}
                  placeholder="Employee name"
                  required
                  disabled={saving}
                />
              </div>
              <div className="form-group">
                <label htmlFor="new-employee-pin">3-Digit PIN</label>
                <input
                  id="new-employee-pin"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{3}"
                  maxLength={3}
                  value={newEmployeePin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 3);
                    setNewEmployeePin(value);
                  }}
                  placeholder="000"
                  required
                  disabled={saving}
                />
                <small className="form-hint">Employee will use this PIN to clock in/out on KDS</small>
              </div>
              <button type="submit" className="btn-submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create Employee'}
              </button>
            </form>
          )}

          {loading ? (
            <p className="loading">Loading employees...</p>
          ) : employees.length === 0 ? (
            <p className="empty-state">No employees yet. Add your first employee to get started.</p>
          ) : (
            <div className="employees-list">
              {employees.map((employee) => (
                <div key={employee.id} className={`employee-item ${!employee.isActive ? 'inactive' : ''}`}>
                  {editingEmployee === employee.id ? (
                    <div className="employee-edit-form">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Name"
                        className="edit-input"
                        disabled={saving}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{3}"
                        maxLength={3}
                        value={editPin}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 3);
                          setEditPin(value);
                        }}
                        placeholder="PIN"
                        className="edit-input"
                        disabled={saving}
                      />
                      <div className="edit-actions">
                        <button
                          onClick={() => handleUpdateEmployee(employee.id)}
                          className="btn-save"
                          disabled={saving}
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="btn-cancel"
                          disabled={saving}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="employee-info">
                        <div className="employee-name">{employee.name}</div>
                        <div className="employee-pin">PIN: {employee.pin}</div>
                        {!employee.isActive && (
                          <span className="inactive-badge">Inactive</span>
                        )}
                      </div>
                      <div className="employee-actions">
                        <button
                          onClick={() => handleToggleActive(employee.id, employee.isActive)}
                          className={`btn-toggle ${employee.isActive ? 'btn-deactivate' : 'btn-activate'}`}
                          disabled={saving}
                        >
                          {employee.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => startEdit(employee)}
                          className="btn-edit"
                          disabled={saving}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteEmployee(employee.id)}
                          className="btn-delete"
                          disabled={saving}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
          color: #e8e8e8;
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
          padding: 32px;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 32px;
        }

        .header-top {
          margin-bottom: 16px;
        }

        .back-link {
          color: #a78bfa;
          text-decoration: none;
          font-size: 14px;
          transition: color 0.2s;
        }

        .back-link:hover {
          color: #c4b5fd;
        }

        .page-header h1 {
          font-size: 32px;
          font-weight: 700;
          margin: 0 0 8px 0;
          color: #e8e8e8;
        }

        .page-header p {
          font-size: 16px;
          color: #888;
          margin: 0;
        }

        .workspace-section {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 24px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .section-header h2 {
          font-size: 20px;
          font-weight: 600;
          margin: 0;
          color: #e8e8e8;
        }

        .btn-add-employee {
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: opacity 0.2s;
          font-family: inherit;
        }

        .btn-add-employee:hover {
          opacity: 0.9;
        }

        .error-banner {
          padding: 12px 16px;
          background: rgba(255, 59, 48, 0.1);
          border: 1px solid rgba(255, 59, 48, 0.3);
          border-radius: 8px;
          color: #ff3b30;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .add-employee-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 20px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          margin-bottom: 24px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          font-size: 14px;
          font-weight: 600;
          color: #a78bfa;
        }

        .form-group input {
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.05);
          color: #e8e8e8;
          font-size: 14px;
          font-family: inherit;
        }

        .form-group input:focus {
          outline: none;
          border-color: #667eea;
        }

        .form-group input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .form-hint {
          font-size: 12px;
          color: #888;
        }

        .btn-submit {
          padding: 12px 24px;
          border-radius: 8px;
          border: none;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: opacity 0.2s;
          font-family: inherit;
          align-self: flex-start;
        }

        .btn-submit:hover:not(:disabled) {
          opacity: 0.9;
        }

        .btn-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .loading, .empty-state {
          color: #888;
          font-size: 14px;
          text-align: center;
          padding: 40px 20px;
        }

        .employees-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .employee-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          transition: all 0.2s;
        }

        .employee-item.inactive {
          opacity: 0.6;
        }

        .employee-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .employee-name {
          font-size: 16px;
          font-weight: 600;
          color: #e8e8e8;
        }

        .employee-pin {
          font-size: 14px;
          color: #888;
          font-family: monospace;
        }

        .inactive-badge {
          display: inline-block;
          padding: 4px 8px;
          background: rgba(255, 159, 10, 0.2);
          color: #ff9f0a;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          margin-top: 4px;
        }

        .employee-actions {
          display: flex;
          gap: 8px;
        }

        .employee-edit-form {
          display: flex;
          gap: 8px;
          align-items: center;
          flex: 1;
        }

        .edit-input {
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.05);
          color: #e8e8e8;
          font-size: 14px;
          font-family: inherit;
          flex: 1;
        }

        .edit-input:focus {
          outline: none;
          border-color: #667eea;
        }

        .edit-actions {
          display: flex;
          gap: 8px;
        }

        .btn-toggle, .btn-edit, .btn-delete, .btn-save, .btn-cancel {
          padding: 8px 16px;
          border-radius: 6px;
          border: none;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }

        .btn-toggle {
          background: rgba(255, 255, 255, 0.1);
          color: #e8e8e8;
        }

        .btn-toggle:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.15);
        }

        .btn-edit {
          background: rgba(102, 126, 234, 0.2);
          color: #667eea;
        }

        .btn-edit:hover:not(:disabled) {
          background: rgba(102, 126, 234, 0.3);
        }

        .btn-delete {
          background: rgba(255, 59, 48, 0.2);
          color: #ff3b30;
        }

        .btn-delete:hover:not(:disabled) {
          background: rgba(255, 59, 48, 0.3);
        }

        .btn-save {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-save:hover:not(:disabled) {
          opacity: 0.9;
        }

        .btn-cancel {
          background: rgba(255, 255, 255, 0.1);
          color: #e8e8e8;
        }

        .btn-cancel:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.15);
        }

        .btn-toggle:disabled, .btn-edit:disabled, .btn-delete:disabled, .btn-save:disabled, .btn-cancel:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .employee-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .employee-actions {
            width: 100%;
            justify-content: flex-end;
          }

          .employee-edit-form {
            flex-direction: column;
            width: 100%;
          }

          .edit-actions {
            width: 100%;
            justify-content: flex-end;
          }
        }
      `}</style>
    </main>
  );
}
