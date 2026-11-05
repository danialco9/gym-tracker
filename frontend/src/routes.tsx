import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from '@/components/AppLayout'
import { ErrorPage } from '@/components/ErrorPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { HomePage } from '@/features/home/HomePage'

// Sign-in and Inicio, the first screens anyone sees, ship in the main bundle; every other screen
// is its own chunk, fetched the first time it opens. The service worker precaches all of them,
// so after the first visit none waits for the network, in the gym or offline.
export const routes: RouteObject[] = [
  {
    // Last resort for anything outside the app shell (sign-in screens, the shell itself).
    errorElement: <ErrorPage />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        path: '/registro',
        lazy: () =>
          import('@/features/auth/RegisterPage').then((module) => ({ Component: module.RegisterPage })),
      },
      {
        path: '/recuperar',
        lazy: () =>
          import('@/features/auth/ForgotPasswordPage').then((module) => ({
            Component: module.ForgotPasswordPage,
          })),
      },
      {
        path: '/restablecer',
        lazy: () =>
          import('@/features/auth/ResetPasswordPage').then((module) => ({
            Component: module.ResetPasswordPage,
          })),
      },
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
                  {
                    path: 'entrenar',
                    lazy: () =>
                      import('@/features/workout/WorkoutPage').then((module) => ({
                        Component: module.WorkoutPage,
                      })),
                  },
                  {
                    path: 'rutinas',
                    lazy: () =>
                      import('@/features/routines/RoutinesPage').then((module) => ({
                        Component: module.RoutinesPage,
                      })),
                  },
                  {
                    path: 'rutinas/nueva',
                    lazy: () =>
                      import('@/features/routines/RoutineEditorPage').then((module) => ({
                        Component: module.RoutineEditorPage,
                      })),
                  },
                  {
                    path: 'rutinas/:routineId',
                    lazy: () =>
                      import('@/features/routines/RoutineEditorPage').then((module) => ({
                        Component: module.RoutineEditorPage,
                      })),
                  },
                  {
                    path: 'medidas',
                    lazy: () =>
                      import('@/features/measurements/MeasurementsPage').then((module) => ({
                        Component: module.MeasurementsPage,
                      })),
                  },
                  {
                    path: 'progreso',
                    lazy: () =>
                      import('@/features/progress/ProgressPage').then((module) => ({
                        Component: module.ProgressPage,
                      })),
                  },
                  {
                    path: 'cuenta',
                    lazy: () =>
                      import('@/features/account/AccountPage').then((module) => ({
                        Component: module.AccountPage,
                      })),
                  },
                  {
                    path: 'objetivo',
                    lazy: () =>
                      import('@/features/goal/GoalPage').then((module) => ({ Component: module.GoalPage })),
                  },
                  {
                    path: 'ranking',
                    lazy: () =>
                      import('@/features/ranking/RankingPage').then((module) => ({
                        Component: module.RankingPage,
                      })),
                  },
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
