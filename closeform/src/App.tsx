import { BrowserRouter, Routes, Route } from 'react-router-dom'
import QuizPage from './pages/QuizPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<QuizPage />} />
      </Routes>
    </BrowserRouter>
  )
}
