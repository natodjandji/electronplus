import * as React from "react";

/** Which control a field's label points at when it holds several: the text
 * input of a "prefix select + number" pair, not the prefix. */
export const FIELD_CONTROL_PRIORITY = { text: 2, choice: 1 } as const;

interface FieldContextValue {
  labelTarget: string | undefined;
  register: (id: string, priority: number) => () => void;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * Wraps a <Label> and its control so the label is tied to it (htmlFor → id)
 * without wiring ids by hand: screen readers announce the field's name, and
 * clicking the label focuses the control. Controls (Input, Textarea,
 * SelectTrigger) register themselves; the label points at the highest
 * priority one, the first of them on a tie.
 */
export function Field(props: React.HTMLAttributes<HTMLDivElement>) {
  const controls = React.useRef(new Map<string, number>());
  const [labelTarget, setLabelTarget] = React.useState<string>();

  const register = React.useCallback((id: string, priority: number) => {
    const pick = () => {
      let best: [string, number] | undefined;
      for (const entry of controls.current) if (!best || entry[1] > best[1]) best = entry;
      setLabelTarget(best?.[0]);
    };
    controls.current.set(id, priority);
    pick();
    return () => {
      controls.current.delete(id);
      pick();
    };
  }, []);

  const value = React.useMemo(() => ({ labelTarget, register }), [labelTarget, register]);
  return (
    <FieldContext.Provider value={value}>
      <div {...props} />
    </FieldContext.Provider>
  );
}

/** A control's id — the caller's own, or a generated one — registered with
 * the surrounding Field, if there is one. */
export function useFieldControlId(explicitId: string | undefined, priority: number): string {
  const generatedId = React.useId();
  const id = explicitId ?? generatedId;
  const register = React.useContext(FieldContext)?.register;
  useIsomorphicLayoutEffect(() => register?.(id, priority), [register, id, priority]);
  return id;
}

/** The id a Label inside a Field should point at. */
export function useFieldLabelTarget(): string | undefined {
  return React.useContext(FieldContext)?.labelTarget;
}
