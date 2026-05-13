import * as React from "react"
import { Select as RSelect } from "radix-ui"
import { Check, ChevronDown, Loader2, Pencil } from "lucide-react"

import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/lib/supabase"
import { nucleosFor, REGIOES, regiaoHasNucleos } from "@/lib/scout-regions"

/**
 * Compact, collapsible editor for the user's scout identity. Shows a
 * one-line summary by default; opens into a tight form when toggled.
 */
export function ProfileEditSection() {
  const { user, profile, refreshProfile } = useAuth()

  const isComplete = Boolean(
    profile?.display_name &&
      profile?.regiao &&
      (!regiaoHasNucleos(profile.regiao) || profile?.nucleo) &&
      profile?.agrupamento_numero &&
      profile?.agrupamento_nome
  )
  const [open, setOpen] = React.useState(false)
  // Profile loads async via Supabase. We default `open` to false and
  // only auto-open on the first load if the profile turns out to be
  // incomplete. After the user has interacted (toggled, saved), we
  // leave their choice alone.
  const autoOpenedRef = React.useRef(false)
  React.useEffect(() => {
    if (autoOpenedRef.current) return
    if (!profile) return
    autoOpenedRef.current = true
    if (!isComplete) setOpen(true)
  }, [profile, isComplete])
  const [displayName, setDisplayName] = React.useState(profile?.display_name ?? "")
  const [regiao, setRegiao] = React.useState(profile?.regiao ?? "")
  const [nucleo, setNucleo] = React.useState(profile?.nucleo ?? "")
  const [agrupamentoNum, setAgrupamentoNum] = React.useState(
    profile?.agrupamento_numero?.toString() ?? ""
  )
  const [agrupamentoNome, setAgrupamentoNome] = React.useState(
    profile?.agrupamento_nome ?? ""
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [savedAt, setSavedAt] = React.useState<number | null>(null)

  React.useEffect(() => {
    setDisplayName(profile?.display_name ?? "")
    setRegiao(profile?.regiao ?? "")
    setNucleo(profile?.nucleo ?? "")
    setAgrupamentoNum(profile?.agrupamento_numero?.toString() ?? "")
    setAgrupamentoNome(profile?.agrupamento_nome ?? "")
  }, [profile])

  const hasNucleos = regiaoHasNucleos(regiao)
  const nucleos = nucleosFor(regiao)

  const onRegiaoChange = (next: string) => {
    setRegiao(next)
    if (!regiaoHasNucleos(next)) setNucleo("")
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase || !user) return
    setError(null)

    const name = displayName.trim()
    if (!name) return setError("Nome obrigatório.")
    if (!regiao) return setError("Escolhe uma região.")
    if (hasNucleos && !nucleo) return setError("Escolhe um núcleo.")
    if (!agrupamentoNum) return setError("Número do agrupamento.")
    if (!agrupamentoNome.trim()) return setError("Nome do agrupamento.")

    setSaving(true)
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        display_name: name,
        regiao,
        nucleo: hasNucleos ? nucleo : null,
        agrupamento_numero: Number(agrupamentoNum),
        agrupamento_nome: agrupamentoNome.trim(),
      })
      .eq("id", user.id)
    setSaving(false)

    if (updateError) return setError(updateError.message)
    setSavedAt(Date.now())
    await refreshProfile()
    setOpen(false)
  }

  const savedRecently = savedAt !== null && Date.now() - savedAt < 3000

  const summary = profile?.regiao
    ? [
        profile.regiao,
        profile.nucleo,
        profile.agrupamento_numero
          ? `Agr. ${profile.agrupamento_numero}${
              profile.agrupamento_nome ? ` ${profile.agrupamento_nome}` : ""
            }`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Por preencher"

  return (
    <section className="border-border bg-card rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/40 flex w-full items-center gap-2 rounded-md px-4 py-3 text-left transition-colors"
        aria-expanded={open}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-muted-foreground text-xs uppercase tracking-wider">
            Dados do escuteiro
          </span>
          <span
            className={cn(
              "truncate text-sm",
              profile?.regiao ? "text-foreground" : "text-muted-foreground italic"
            )}
          >
            {summary}
          </span>
        </span>
        {savedRecently ? (
          <Check className="text-primary size-4 shrink-0" />
        ) : (
          <Pencil className="text-muted-foreground size-4 shrink-0" />
        )}
        <ChevronDown
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <form
          onSubmit={handleSubmit}
          className="border-border flex flex-col gap-3 border-t px-4 py-4"
        >
          <Field label="Nome">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              required
            />
          </Field>

          <Field label="Região">
            <FancySelect
              value={regiao}
              onValueChange={onRegiaoChange}
              placeholder="Escolhe a tua região…"
              options={REGIOES.map((r) => ({ value: r.name, label: r.name }))}
            />
          </Field>

          {hasNucleos ? (
            <Field label="Núcleo">
              <FancySelect
                value={nucleo}
                onValueChange={setNucleo}
                placeholder="Escolhe o teu núcleo…"
                options={nucleos.map((n) => ({ value: n, label: n }))}
              />
            </Field>
          ) : null}

          <Field label="Agrupamento">
            <div className="flex gap-2">
              <Input
                aria-label="Número"
                inputMode="numeric"
                pattern="\d*"
                value={agrupamentoNum}
                onChange={(e) =>
                  setAgrupamentoNum(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="Nº"
                className="w-20"
                required
              />
              <Input
                aria-label="Nome do agrupamento"
                value={agrupamentoNome}
                onChange={(e) => setAgrupamentoNome(e.target.value)}
                placeholder="Nome"
                maxLength={80}
                className="flex-1"
                required
              />
            </div>
          </Field>

          {error ? (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-semibold shadow-xs disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Guardar
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}

interface FieldProps {
  label: string
  children: React.ReactNode
}

function Field({ label, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs uppercase tracking-wider">
        {label}
      </span>
      {children}
    </label>
  )
}

interface FancySelectProps {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  options: Array<{ value: string; label: string }>
}

/**
 * Radix-backed dropdown styled to mirror the shared <Input>. Replaces
 * the native <select> so the open panel matches the rest of the app
 * (dark surface, app colors, smooth transitions) instead of the OS UI.
 */
function FancySelect({ value, onValueChange, placeholder, options }: FancySelectProps) {
  return (
    <RSelect.Root value={value || undefined} onValueChange={onValueChange}>
      <RSelect.Trigger
        className={cn(
          "border-input bg-background text-foreground",
          "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-sm shadow-xs",
          "transition-[color,box-shadow] outline-none",
          "focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-3",
          "data-[placeholder]:text-muted-foreground",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon asChild>
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={6}
          className={cn(
            "border-border bg-card text-foreground z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border shadow-lg",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          )}
        >
          <RSelect.Viewport className="p-1">
            {options.map((opt) => (
              <RSelect.Item
                key={opt.value}
                value={opt.value}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm outline-none",
                  "data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground",
                  "data-[state=checked]:font-semibold"
                )}
              >
                <RSelect.ItemText>{opt.label}</RSelect.ItemText>
                <RSelect.ItemIndicator className="ml-auto">
                  <Check className="size-3.5" />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  )
}
