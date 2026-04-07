import { Layout } from './components/Layout';
import { PatternEditor } from './components/PatternEditor';
import { ResultPanel } from './components/ResultPanel';

function App() {
  return (
    <Layout
      patternPanel={<PatternEditor />}
      resultPanel={<ResultPanel />}
    />
  );
}

export default App;
