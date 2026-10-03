import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AppShell from "@/components/AppShell/AppShell";
import { DashboardPage, JobDetailPage, JobsPage } from "@/modules/jobs";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/files" element={<JobsPage />} />
          <Route path="/jobs/:jobId" element={<JobDetailPage />} />
          {/* Settings is a modal now (toolbar gear); keep old links working */}
          <Route path="/settings" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
