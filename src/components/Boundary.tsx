import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode; fallback: ReactNode };
type State = { failed: boolean };

/**
 * Keeps an optional, lazily-loaded feature (the AI page) from taking the rest of
 * the app down with it. A failed chunk load shows the fallback, everything else
 * keeps working.
 */
export class Boundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No telemetry by design; the console line is for local debugging only.
    console.warn('[Foldyssey] optional module failed', error.message, info.componentStack?.slice(0, 200));
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
