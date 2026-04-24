import { RouterProvider } from 'react-router';
import { AuthProvider } from './context/AuthContext';
import { DateRangeProvider } from './context/DateRangeContext';
import { router } from './routes';

export default function App() {
  return (
    <AuthProvider>
      <DateRangeProvider>
        <RouterProvider router={router} />
      </DateRangeProvider>
    </AuthProvider>
  );
}
