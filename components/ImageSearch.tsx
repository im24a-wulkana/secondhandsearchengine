'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Camera, Loader2, X } from 'lucide-react';

type Result = {
  query: string;
  brand?: string;
  garment: string;
  colour?: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
  alternatives?: string[];
};

const MAX_BYTES = 5_000_000;

export default function ImageSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [editable, setEditable] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const reset = () => {
    setOpen(false);
    setResult(null);
    setError(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setError('That image is too large. Use one under 5MB.');
      setOpen(true);
      return;
    }

    setOpen(true);
    setIsLoading(true);
    setError(null);
    setResult(null);
    setPreview(URL.createObjectURL(file));

    try {
      const buffer = await file.arrayBuffer();
      // btoa needs a binary string; chunk it so large files don't blow the stack.
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }

      const res = await fetch('/api/image-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: btoa(binary), mediaType: file.type || 'image/jpeg' }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? 'Could not identify that image.');
        return;
      }
      setResult(data.result);
      setEditable(data.result.query);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const search = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    reset();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="btn btn-ghost !p-2"
        aria-label="Search using a photo"
        title="Search using a photo"
      >
        <Camera size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center sm:p-6">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={reset}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="img-title"
            className="relative w-full max-w-md rounded-t-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--bg)] p-5 text-left shadow-[var(--shadow-lg)] sm:rounded-[var(--r-lg)] sm:p-6"
          >
            <button
              type="button"
              onClick={reset}
              aria-label="Close"
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-subtle)]"
            >
              <X size={17} />
            </button>

            <h2 id="img-title" className="font-display text-xl">
              Search by photo
            </h2>

            {preview && (
              /* eslint-disable-next-line @next/next/no-img-element -- blob: URL, not a remote asset */
              <img
                src={preview}
                alt=""
                className="mt-4 h-40 w-full rounded-[var(--r-md)] object-contain"
              />
            )}

            {isLoading && (
              <p className="mt-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Loader2 size={15} className="animate-spin" />
                Identifying the item…
              </p>
            )}

            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-[var(--r-md)] border border-[var(--danger)] bg-[var(--danger-wash)] px-3.5 py-2.5 text-sm text-[var(--danger)]"
              >
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {result && !isLoading && (
              <div className="mt-4 flex flex-col gap-3">
                <div>
                  <label htmlFor="img-query" className="eyebrow mb-1.5 block">
                    Search for
                  </label>
                  <input
                    id="img-query"
                    value={editable}
                    onChange={(e) => setEditable(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') search(editable);
                    }}
                    className="field"
                  />
                  <p className="mt-1.5 text-xs text-[var(--text-faint)]">
                    {result.confidence === 'high'
                      ? 'Confident match.'
                      : result.confidence === 'medium'
                        ? 'Reasonably confident — edit if it looks wrong.'
                        : 'Low confidence — worth editing before searching.'}{' '}
                    {result.notes}
                  </p>
                </div>

                {result.alternatives && result.alternatives.length > 0 && (
                  <div>
                    <span className="eyebrow">Or try</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {result.alternatives.map((alt) => (
                        <button
                          key={alt}
                          type="button"
                          onClick={() => setEditable(alt)}
                          className="rounded-[var(--r-pill)] border border-[var(--hairline)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          {alt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => search(editable)}
                  className="btn btn-primary mt-1 w-full"
                >
                  Search
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
