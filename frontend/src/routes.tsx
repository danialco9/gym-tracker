import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from '@/components/AppLayout'
import { ErrorPage } from '@/components/ErrorPage'
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
import { RankingPage } from '@/features/ranking/RankingPage'
import { RoutineEditorPage } from '@/features/routines/RoutineEditorPage'
import { RoutinesPage } from '@/features/routines/RoutinesPage'
import { WorkoutPage } from '@/features/workout/WorkoutPage'

export const routes: RouteObject[] = [
  {
    // Last resort for anything outside the app shell (sign-in screens, the shell itself).
    errorElement: <ErrorPage />,
    children: [
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
              {
                // A screen that breaks is replaced inside the shell: the header and the bottom
                // navigation stay, so the rest of the app is one tap away.
                errorElement: <ErrorPage />,
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
                  { path: 'ranking', element: <RankingPage /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]
