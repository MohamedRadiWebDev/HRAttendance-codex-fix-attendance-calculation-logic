import { Bell, Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";

export function Header({ title }: { title: string }) {
  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-border/50 h-16 flex items-center justify-between px-8 sticky top-0 z-10">
      <h2 className="text-xl font-bold font-display text-foreground">{title}</h2>
      
      <div className="flex items-center gap-4">
        <div className="relative hidden md:block w-64">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="بحث..." 
            className="pr-10 bg-slate-50 border-transparent focus:bg-white focus:border-primary/50 transition-all" 
          />
        </div>
        
        <button className="relative w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-colors border border-border/50">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <span className="absolute top-2 left-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
        </button>
        
        <div className="flex items-center gap-3 border-r border-border/50 pr-4 mr-1">
          <div className="text-left hidden sm:block">
            <p className="text-sm font-semibold">مدير النظام</p>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-primary/20">
            <User className="w-5 h-5" />
          </div>
        </div>
      </div>
    </header>
  );
}
