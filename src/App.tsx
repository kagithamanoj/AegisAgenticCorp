import { Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import CorporateLayout from './components/CorporateLayout';
import DashboardLayout from './components/Layout';
import LandingView from './views/LandingView';
import ProductsView from './views/ProductsView';
import SolutionsView from './views/SolutionsView';
import CompanyView from './views/CompanyView';
import LegalView from './views/LegalView';
import MissionControl from './views/MissionControl';
import ChannelView from './views/ChannelView';
import SquadView from './views/SquadView';
import SettingsView from './views/SettingsView';
import AnalyticsView from './views/AnalyticsView';
import BroadcastView from './views/BroadcastView';
import NotificationsView from './views/NotificationsView';
import Dashboard from './views/Dashboard';
import ResearchView from './views/ResearchView';
import SafetyView from './views/SafetyView';
import CareersView from './views/CareersView';
import NewsView from './views/NewsView';
import PricingView from './views/PricingView';
import ContactView from './views/ContactView';
import './App.css';

// Wrapper for Project Hubs since we construct the title dynamically
const ProjectHubWrapper = () => {
  const { projectName } = useParams();
  const title = projectName ? projectName.charAt(0).toUpperCase() + projectName.slice(1).replace(/-/g, ' ') + ' Hub' : 'Project Hub';
  return <ChannelView key={`project-${projectName}`} agent="monica" title={title} />;
};

const ChannelViewWrapper = () => {
  const { agent } = useParams();
  return <ChannelView key={agent} agent={agent || 'monica'} />;
};

function App() {
  return (
    <Routes>
      {/* Public / Marketing Routes */}
      <Route element={<CorporateLayout />}>
        <Route path="/" element={<LandingView />} />
        <Route path="/products" element={<ProductsView />} />
        <Route path="/solutions" element={<SolutionsView />} />
        <Route path="/research" element={<ResearchView />} />
        <Route path="/safety" element={<SafetyView />} />
        <Route path="/careers" element={<CareersView />} />
        <Route path="/news" element={<NewsView />} />
        <Route path="/pricing" element={<PricingView />} />
        <Route path="/contact" element={<ContactView />} />
        <Route path="/company" element={<CompanyView />} />
        <Route path="/legal/:page" element={<LegalView />} />
      </Route>

      {/* Internal App Routes */}
      <Route path="/" element={<DashboardLayout><Outlet /></DashboardLayout>}>
        <Route index element={<Dashboard />} />
        <Route path="mission" element={<MissionControl />} />
        <Route path="squad" element={<SquadView setActiveView={(v) => {
          // Fallback if SquadView internally still uses the old function. 
          // Ideally we update SquadView too, but this prevents crashes.
          window.location.href = v.startsWith('channel-') ? `/channel/${v.split('-')[1]}` : `/${v}`;
        }} />} />
        <Route path="settings" element={<SettingsView />} />
        <Route path="analytics" element={<AnalyticsView />} />
        <Route path="broadcast" element={<BroadcastView />} />
        <Route path="notifications" element={<NotificationsView />} />
        <Route path="channel/:agent" element={<ChannelViewWrapper />} />
        <Route path="project/:projectName" element={<ProjectHubWrapper />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
