import { useEffect, useMemo, useRef, useState } from 'react';
import { createLexerAnalyzer } from '../core/lexer-analyzer.js';
import { lexerConfigurationKey } from '../core/lexer-cache.js';
import { tokenize } from '../core/lexer.js';
export function useLexer(machine, input, version) {
  const analyzer = useRef(null);
  const [analysis, setAnalysis] = useState({
    tokens: [],
    error: null,
  });
  const key = useMemo(() => lexerConfigurationKey(machine), [machine, version]);
  const machineRef = useRef(machine);
  machineRef.current = machine;
  useEffect(() => {
    analyzer.current = createLexerAnalyzer(tokenize, {
      workerFactory: () =>
        new Worker(new URL('../core/lexer-worker.js', import.meta.url), {
          type: 'module',
        }),
    });
    return () => {
      analyzer.current?.dispose();
      analyzer.current = null;
    };
  }, []);
  useEffect(() => {
    let current = true;
    analyzer.current.cancel();
    const timer = setTimeout(async () => {
      try {
        const tokens = await analyzer.current.get(machineRef.current, input);
        if (current)
          setAnalysis({
            tokens,
            input,
            key,
            error: null,
          });
      } catch (error) {
        if (current && error.name !== 'AbortError')
          setAnalysis({
            tokens: [],
            input,
            key,
            error,
          });
      }
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
      analyzer.current?.cancel();
    };
  }, [key, input]);
  const pending = analysis.input !== input || analysis.key !== key;
  return {
    ...analysis,
    pending,
    error: pending ? null : analysis.error,
    key,
  };
}
