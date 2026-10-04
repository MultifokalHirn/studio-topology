// Contain rendering errors to one panel so the rest of the app (and the unsaved project) stays usable.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '@/i18n';

export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label} crashed`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="m-3 rounded border border-red-300 p-3 text-sm text-red-800 dark:border-red-800 dark:text-red-300"
      >
        <p className="font-semibold">{t('{label} failed to render.', { label: this.props.label })}</p>
        <p className="mt-1 font-mono text-xs">{this.state.error.message}</p>
        <p className="mt-1 text-xs">{t('Your project is unaffected; autosave keeps running.')}</p>
        <button className="mt-2 underline" onClick={() => this.setState({ error: null })}>
          {t('Try again')}
        </button>
      </div>
    );
  }
}
