import { Layout } from './components/Layout';
import { ShapePanel } from './components/ShapePanel';
import { TangramPanel } from './components/TangramPanel';
import { ResultPanel } from './components/ResultPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { ExportModal } from './components/ExportModal';

function App() {
  return (
    <>
      <Layout
        shapePanel={<ShapePanel />}
        tangramPanel={<TangramPanel />}
        resultPanel={<ResultPanel />}
        inspectorPanel={<InspectorPanel />}
      />
      <ExportModal />
    </>
  );
}

export default App;
