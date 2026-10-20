import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from '@/components/AppLayout'
import { AccountPage } from '@/features/account/AccountPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { GoalPage } from '@/features/goal/GoalPage'
import { HomePage } from '@/features/home/HomePage'
import { MeasurementsPage } from '@/features/measurements/MeasurementsPage'
import { ProgressPage } from '@/features/progress/ProgressPage'
import { RoutineEditorPage } from '@/features/routines/RoutineEditorPage'
import { RoutinesPage } from '@/features/routines/RoutinesPage'
import { WorkoutPage } from '@/features/workout/WorkoutPage'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/registro', element: <RegisterPage /> },
  { path: '/recuperar', element: <ForgotPasswordPage /> },
  { path: '/restablecer', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'entrenar', element: <WorkoutPage /> },
          { path: 'rutinas', element: <RoutinesPage /> },
          { path: 'rutinas/nueva', element: <RoutineEditorPage /> },
          { path: 'rutinas/:routineId', element: <RoutineEditorPage /> },
          { path: 'medidas', element: <MeasurementsPage /> },
          { path: 'progreso', element: <ProgressPage /> },
          { path: 'cuenta', element: <AccountPage /> },
          { path: 'objetivo', element: <GoalPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]
