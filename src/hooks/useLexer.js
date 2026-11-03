import { useEffect, useRef, useState } from 'react';
import { createLexerAnalyzer } from '../core/lexer-analyzer.js';
import { lexerConfigurationKey } from '../core/lexer-cache.js';
import { tokenize } from '../core/lexer.js';
export function useLexer(machine, input) {
  const analyzer = useRef(null);
  const [analysis, setAnalysis] = useState({
    tokens: [],
    pending: true,
    error: null,
  });
  const key = lexerConfigurationKey(machine);
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
    setAnalysis((previous) => ({
      ...previous,
      pending: true,
      error: null,
    }));
    const timer = setTimeout(async () => {
      try {
        const tokens = await analyzer.current.get(machineRef.current, input);
        if (current)
          setAnalysis({
            tokens,
            pending: false,
            error: null,
          });
      } catch (error) {
        if (current && error.name !== 'AbortError')
          setAnalysis({
            tokens: [],
            pending: false,
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
  return {
    ...analysis,
    key,
  };
}
