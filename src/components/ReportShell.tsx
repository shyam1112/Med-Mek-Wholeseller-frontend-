import React from 'react';
import { Button } from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { PageHeader } from './PageHeader';
import { FilterBar } from './Filters';

// Standard report page: title, filters row, Excel + Print actions, body.
// Printing uses the browser's print with the sidebar/topbar hidden by the
// @media print rules in main.tsx.
export const ReportShell: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  filters?: React.ReactNode;
  onExport?: () => void;
  actions?: React.ReactNode;
  help?: string[];
  children: React.ReactNode;
}> = ({ title, subtitle, filters, onExport, actions, help, children }) => (
  <>
    <PageHeader
      title={title}
      subtitle={subtitle}
      help={help}
      crumbs={[{ label: 'Reports' }]}
      actions={
        <>
          {actions}
          {onExport && <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={onExport}>Excel</Button>}
          <Button variant="outlined" className="no-print" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()}>Print</Button>
        </>
      }
    />
    {filters && <div className="no-print"><FilterBar>{filters}</FilterBar></div>}
    {children}
  </>
);
