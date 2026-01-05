import type { ItemPerformance } from '@countrtop/models';

type ItemPerformanceTableProps = {
  data: ItemPerformance[];
  loading?: boolean;
  limit?: number; // Show top N items
};

/**
 * Item performance table
 * Note: All data shown is for CountrTop online orders only
 */
export function ItemPerformanceTable({ data, loading, limit = 50 }: ItemPerformanceTableProps) {
  if (loading) {
    return (
      <div className="table-container">
        <div className="table-loading">Loading item data...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="table-container">
        <div className="table-empty">No item data available for selected date range</div>
      </div>
    );
  }

  const displayData = data.slice(0, limit);
  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

  return (
    <div className="table-container">
      <div className="table-header">
        <h3>Item Performance</h3>
        <span className="scope-label">CountrTop Online Only</span>
      </div>
      <div className="table-wrapper">
        <table className="item-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th className="text-right">Quantity</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">Orders</th>
              <th className="text-right">Avg Price</th>
            </tr>
          </thead>
          <tbody>
            {displayData.map((item, index) => (
              <tr key={`${item.itemName}-${index}`}>
                <td className="item-name">{item.itemName}</td>
                <td className="text-right">{item.quantity.toLocaleString()}</td>
                <td className="text-right">{formatCurrency(item.revenue)}</td>
                <td className="text-right">{item.orderCount.toLocaleString()}</td>
                <td className="text-right">{formatCurrency(item.avgPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > limit && (
        <div className="table-footer">
          Showing top {limit} of {data.length} items
        </div>
      )}

      <style jsx>{`
        .table-container {
          width: 100%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 20px;
        }

        .table-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .table-header h3 {
          font-size: 18px;
          font-weight: 600;
          color: #e8e8e8;
          margin: 0;
        }

        .scope-label {
          font-size: 12px;
          font-weight: 500;
          color: #a78bfa;
          background: rgba(167, 139, 250, 0.1);
          padding: 4px 12px;
          border-radius: 4px;
          border: 1px solid rgba(167, 139, 250, 0.2);
        }

        .table-wrapper {
          overflow-x: auto;
        }

        .item-table {
          width: 100%;
          border-collapse: collapse;
        }

        .item-table thead {
          background: rgba(255, 255, 255, 0.05);
        }

        .item-table th {
          padding: 12px 16px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .item-table th.text-right {
          text-align: right;
        }

        .item-table tbody tr {
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .item-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .item-table td {
          padding: 12px 16px;
          font-size: 14px;
          color: #e8e8e8;
        }

        .item-table td.text-right {
          text-align: right;
        }

        .item-name {
          font-weight: 500;
          color: #e8e8e8;
        }

        .table-loading,
        .table-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: #888;
          font-size: 14px;
        }

        .table-footer {
          margin-top: 16px;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
      `}</style>
    </div>
  );
}

