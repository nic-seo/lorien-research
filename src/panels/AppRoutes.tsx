import { Routes, Route } from 'react-router-dom';
import Overview from '../pages/Overview';
import ProjectDetail from '../pages/ProjectDetail';
import ReportView from '../pages/ReportView';
import ChatView from '../components/features/ChatView';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Overview />} />
      <Route path="/project/:projectId" element={<ProjectDetail />} />
      <Route path="/project/:projectId/chat/:chatId" element={<ChatView />} />
      <Route path="/project/:projectId/report/:reportId" element={<ReportView />} />
    </Routes>
  );
}
