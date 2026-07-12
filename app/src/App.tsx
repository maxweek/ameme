import { useState } from 'react'
import { Brain } from './components/brain'
import { useMemoryEvents } from './hooks/useMemoryEvents';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Header } from './components/header';
import { GraphPage } from './pages/graph';
import { VerbatimPage } from './pages/verbatim';
import { SearchPage } from './pages/search';
import { InfoPage } from './pages/info';
import { OperationsPage } from './pages/operations';
import { DreamingPage } from './pages/dreaming';
import { StartupPage } from './pages/startup';
import { ObsidianPage } from './pages/obsidian';

function App() {

  useMemoryEvents();

  return (
    <BrowserRouter>
      <div id="__site_wrapper">
        <Header />
        <main>
          <Routes>
            <Route path='/' element={<GraphPage />} />
            <Route path='/verbatim' element={<VerbatimPage />} />
            <Route path='/obsidian' element={<ObsidianPage />} />
            <Route path='/startup' element={<StartupPage />} />
            <Route path='/dreaming' element={<DreamingPage />} />
            <Route path='/operations' element={<OperationsPage />} />
            <Route path='/info' element={<InfoPage />} />
            <Route path='/search' element={<SearchPage />} />
          </Routes>

        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
