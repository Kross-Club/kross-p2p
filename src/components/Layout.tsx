import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import AccountSelector from './AccountSelector'

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 flex justify-center">
      <div className="w-full max-w-[430px] min-h-screen bg-white relative flex flex-col shadow-2xl">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center">
              <span className="text-white font-black text-sm">K</span>
            </div>
            <span className="font-black text-gray-900 text-lg tracking-tight">kross</span>
          </div>
          <AccountSelector />
        </header>

        <main className="flex-1 pb-20 overflow-y-auto">
          <Outlet />
        </main>

        <BottomNav />
      </div>
    </div>
  )
}
