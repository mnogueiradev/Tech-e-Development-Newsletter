import { Toaster } from 'react-hot-toast';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Editions from './pages/Editions';
import EditionDetail from './pages/EditionDetail';

function App() {
  return (
    <>
      <Toaster 
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#1F2937',
            color: '#fff',
            border: '1px solid #374151'
          },
          success: {
            iconTheme: {
              primary: '#10B981',
              secondary: '#fff',
            },
          },
        }}
      />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/edicoes" element={<Editions />} />
        <Route path="/edicoes/:slug" element={<EditionDetail />} />
      </Routes>
    </>
  );
}

export default App;
