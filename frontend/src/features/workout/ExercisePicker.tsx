import { useId, useMemo, useState } from 'react'
import { ArrowLeftIcon, ChevronDownIcon, InfoIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import { cn } from 'cn'
import { QueryStatus } from '@/components/QueryStatus'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from '@/lib/labels'
import type { Equipment, Exercise, MuscleGroup } from '@/lib/types'
import { CreateExerciseSheet } from './CreateExerciseSheet'
import { ExerciseInfoSheet } from './ExerciseInfoSheet'
import { ExerciseThumbnail } from './ExerciseThumbnail'
import { OptionChip } from './OptionChip'
import { applyFilters, type ExerciseFilters, filterExercises, recentExercises } from './exercise-search'
import { useExercises, useRecentWorkouts } from './queries'

interface ExercisePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (exercise: Exercise) => void
}

export function ExercisePicker({ open, onOpenChange, onSelect }: ExercisePickerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="top-0 mx-auto h-dvh max-w-2xl gap-0 border-t-0 sm:border-x"
      >
        {/* Mounted only while open, so every visit starts with an empty search and no filters. */}
        <PickerBody onSelect={onSelect} />
      </SheetContent>
    </Sheet>
  )
}

type FilterKind = 'muscle' | 'equipment'

const NO_FILTERS: ExerciseFilters = { muscle: null, equipment: null }

function PickerBody({ onSelect }: Pick<ExercisePickerProps, 'onSelect'>) {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<ExerciseFilters>(NO_FILTERS)
  const [openFilter, setOpenFilter] = useState<FilterKind | null>(null)
  const [info, setInfo] = useState<Exercise | null>(null)
  const [creating, setCreating] = useState(false)
  const exercises = useExercises()
  // Shares the home screen's query; if it fails, the picker simply shows no recents.
  const workouts = useRecentWorkouts()

  const results = useMemo(
    () => applyFilters(filterExercises(exercises.data ?? [], search), filters),
    [exercises.data, search, filters],
  )
  const browsing = search.trim() === '' && filters.muscle === null && filters.equipment === null
  const recent = useMemo(
    () => (browsing ? recentExercises(workouts.data ?? [], exercises.data ?? []) : []),
    [browsing, workouts.data, exercises.data],
  )

  return (
    <>
      <header className="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <SheetClose render={<Button variant="ghost" size="icon-lg" aria-label="Volver" />}>
          <ArrowLeftIcon />
        </SheetClose>
        <SheetTitle className="flex-1 text-lg font-semibold">Añadir ejercicio</SheetTitle>
        <SheetDescription className="sr-only">
          Busca por nombre o filtra por músculo y material.
        </SheetDescription>
        <Button
          variant="ghost"
          size="lg"
          aria-label="Crear ejercicio"
          className="text-primary"
          onClick={() => setCreating(true)}
        >
          <PlusIcon />
          Crear
        </Button>
      </header>

      <div className="space-y-3 px-4 pb-3">
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            aria-label="Buscar ejercicio"
            placeholder="Buscar ejercicio"
            className="h-11 pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Borrar búsqueda"
              className="absolute top-1/2 right-1.5 -translate-y-1/2"
              onClick={() => setSearch('')}
            >
              <XIcon />
            </Button>
          )}
        </div>
        <FilterBar
          filters={filters}
          openFilter={openFilter}
          onToggle={(kind) => setOpenFilter((current) => (current === kind ? null : kind))}
          onChange={(next) => {
            setFilters(next)
            setOpenFilter(null)
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
        <QueryStatus
          query={exercises}
          loading="Cargando ejercicios…"
          error="No se pudo cargar el catálogo de ejercicios."
          className="m-4 w-auto"
        />
        {recent.length > 0 && (
          <ExerciseSection title="Recientes" exercises={recent} onSelect={onSelect} onInfo={setInfo} />
        )}
        {exercises.isSuccess &&
          (results.length === 0 ? (
            <div className="space-y-3 px-4 py-6">
              <p className="text-muted-foreground text-sm">No hay ejercicios que coincidan.</p>
              {search.trim() && (
                <Button size="lg" className="h-12 w-full text-base" onClick={() => setCreating(true)}>
                  <PlusIcon />
                  <span className="truncate">Crear «{search.trim()}»</span>
                </Button>
              )}
            </div>
          ) : (
            <ExerciseSection
              title={
                browsing
                  ? 'Todos los ejercicios'
                  : `${results.length} ${results.length === 1 ? 'ejercicio' : 'ejercicios'}`
              }
              exercises={results}
              onSelect={onSelect}
              onInfo={setInfo}
            />
          ))}
      </div>

      <ExerciseInfoSheet
        exercise={info}
        onClose={() => setInfo(null)}
        onAdd={(exercise) => {
          setInfo(null)
          onSelect(exercise)
        }}
      />
      <CreateExerciseSheet
        open={creating}
        initialName={search}
        onOpenChange={setCreating}
        onCreated={(exercise) => {
          setCreating(false)
          onSelect(exercise)
        }}
      />
    </>
  )
}

interface FilterBarProps {
  filters: ExerciseFilters
  openFilter: FilterKind | null
  onToggle: (kind: FilterKind) => void
  onChange: (filters: ExerciseFilters) => void
}

const MUSCLE_OPTIONS = Object.entries(MUSCLE_GROUP_LABELS) as [MuscleGroup, string][]
const EQUIPMENT_OPTIONS = Object.entries(EQUIPMENT_LABELS) as [Equipment, string][]

/** Two buttons that each open one row of options; a chosen filter replaces the button's label. */
function FilterBar({ filters, openFilter, onToggle, onChange }: FilterBarProps) {
  const panelId = useId()
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <FilterButton
          label={filters.muscle ? MUSCLE_GROUP_LABELS[filters.muscle] : 'Músculos'}
          active={filters.muscle !== null}
          expanded={openFilter === 'muscle'}
          controls={panelId}
          onClick={() => onToggle('muscle')}
        />
        <FilterButton
          label={filters.equipment ? EQUIPMENT_LABELS[filters.equipment] : 'Equipamiento'}
          active={filters.equipment !== null}
          expanded={openFilter === 'equipment'}
          controls={panelId}
          onClick={() => onToggle('equipment')}
        />
      </div>
      {openFilter && (
        <div
          id={panelId}
          role="group"
          aria-label={openFilter === 'muscle' ? 'Filtrar por músculo' : 'Filtrar por equipamiento'}
          className="flex flex-wrap gap-2"
        >
          {openFilter === 'muscle' ? (
            <FilterOptions
              options={MUSCLE_OPTIONS}
              selected={filters.muscle}
              onSelect={(muscle) => onChange({ ...filters, muscle })}
            />
          ) : (
            <FilterOptions
              options={EQUIPMENT_OPTIONS}
              selected={filters.equipment}
              onSelect={(equipment) => onChange({ ...filters, equipment })}
            />
          )}
        </div>
      )}
    </div>
  )
}

interface FilterButtonProps {
  label: string
  active: boolean
  expanded: boolean
  controls: string
  onClick: () => void
}

function FilterButton({ label, active, expanded, controls, onClick }: FilterButtonProps) {
  return (
    <Button
      variant="secondary"
      aria-expanded={expanded}
      aria-controls={expanded ? controls : undefined}
      className={cn('h-10 justify-between', active && 'bg-primary/15 text-primary hover:bg-primary/25')}
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      <ChevronDownIcon className={cn('transition-transform', expanded && 'rotate-180')} />
    </Button>
  )
}

interface FilterOptionsProps<T extends string> {
  options: [T, string][]
  selected: T | null
  onSelect: (value: T | null) => void
}

function FilterOptions<T extends string>({ options, selected, onSelect }: FilterOptionsProps<T>) {
  return (
    <>
      <OptionChip label="Todos" pressed={selected === null} onClick={() => onSelect(null)} />
      {options.map(([value, label]) => (
        <OptionChip key={value} label={label} pressed={selected === value} onClick={() => onSelect(value)} />
      ))}
    </>
  )
}

interface ExerciseSectionProps {
  title: string
  exercises: Exercise[]
  onSelect: (exercise: Exercise) => void
  onInfo: (exercise: Exercise) => void
}

function ExerciseSection({ title, exercises, onSelect, onInfo }: ExerciseSectionProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="eyebrow px-4 pt-4 pb-1">
        {title}
      </h3>
      <ul>
        {exercises.map((exercise) => {
          const nameId = `${headingId}-${exercise.id}`
          return (
            <li key={exercise.id} className="hover:bg-muted flex items-center pr-2 transition-colors">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left"
                onClick={() => onSelect(exercise)}
              >
                <ExerciseThumbnail exercise={exercise} />
                <span className="min-w-0">
                  <span id={nameId} className="block font-medium">
                    {exercise.name}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {MUSCLE_GROUP_LABELS[exercise.muscle_group]}
                    {exercise.equipment && ` · ${EQUIPMENT_LABELS[exercise.equipment]}`}
                  </span>
                </span>
              </button>
              {/* Named without the exercise, so a search for the exercise by name finds only the row. */}
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label="Ver ficha"
                aria-describedby={nameId}
                className="text-muted-foreground shrink-0"
                onClick={() => onInfo(exercise)}
              >
                <InfoIcon className="size-5" />
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
