import type { ComponentProps, CSSProperties } from "react";
import { cn } from "@/lib/utils";

const glyphs = {
  ArrowLeft: "arrow_back",
  ArrowRight: "arrow_forward",
  Armchair: "chair",
  Banknote: "payments",
  CalendarDays: "calendar_month",
  Schedule: "schedule",
  Theater: "theater_comedy",
  Map: "map",
  Sell: "sell",
  Person: "person",
  Admin: "admin_panel_settings",
  CheckCircle: "check_circle",
  Check: "check",
  ChevronDown: "expand_more",
  CircleAlert: "error",
  Clock3: "timer",
  CloudOff: "wifi_off",
  Eye: "visibility",
  EyeOff: "visibility_off",
  FileJson: "code",
  Home: "explore",
  ImageIcon: "image",
  Info: "info",
  LifeBuoy: "help",
  LockKeyhole: "lock",
  LogIn: "login",
  Mail: "mail",
  MapPin: "location_on",
  Menu: "menu",
  RotateCw: "refresh",
  Scan: "center_focus_strong",
  Search: "search",
  SearchX: "search_off",
  Settings: "settings",
  Ticket: "confirmation_number",
  Upload: "upload",
  UserRound: "account_circle",
  ZoomIn: "zoom_in",
  ZoomOut: "zoom_out",
  Close: "close",
} as const;

type SymbolProps = Omit<ComponentProps<"span">, "children"> & {
  size?: number;
  filled?: boolean;
};
interface MaterialIconProps extends SymbolProps {
  readonly name: keyof typeof glyphs;
}

/** The approved references use this font, rather than SVG approximations. */
export function MaterialIcon({
  name,
  size,
  filled = false,
  className,
  style,
  ...props
}: MaterialIconProps) {
  return (
    <span
      aria-hidden="true"
      {...props}
      data-icon={glyphs[name]}
      className={cn("material-symbol", className)}
      style={
        {
          ...style,
          ...(size ? { "--symbol-size": `${size}px` } : {}),
          fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400`,
        } as CSSProperties
      }
    >
      {glyphs[name]}
    </span>
  );
}

function symbol(name: MaterialIconProps["name"]) {
  return function Symbol(props: SymbolProps) {
    return <MaterialIcon name={name} {...props} />;
  };
}

export const ArrowLeft = symbol("ArrowLeft"),
  ArrowRight = symbol("ArrowRight"),
  Armchair = symbol("Armchair"),
  Banknote = symbol("Banknote"),
  CalendarDays = symbol("CalendarDays"),
  Schedule = symbol("Schedule"),
  Theater = symbol("Theater"),
  Map = symbol("Map"),
  Sell = symbol("Sell"),
  Person = symbol("Person"),
  Admin = symbol("Admin"),
  CheckCircle = symbol("CheckCircle"),
  Check = symbol("Check"),
  ChevronDown = symbol("ChevronDown"),
  CircleAlert = symbol("CircleAlert"),
  Clock3 = symbol("Clock3"),
  CloudOff = symbol("CloudOff"),
  Eye = symbol("Eye"),
  EyeOff = symbol("EyeOff"),
  FileJson = symbol("FileJson"),
  Home = symbol("Home"),
  ImageIcon = symbol("ImageIcon"),
  Info = symbol("Info"),
  LifeBuoy = symbol("LifeBuoy"),
  LockKeyhole = symbol("LockKeyhole"),
  LogIn = symbol("LogIn"),
  Mail = symbol("Mail"),
  MapPin = symbol("MapPin"),
  Menu = symbol("Menu"),
  RotateCw = symbol("RotateCw"),
  Scan = symbol("Scan"),
  Search = symbol("Search"),
  SearchX = symbol("SearchX"),
  Settings = symbol("Settings"),
  Ticket = symbol("Ticket"),
  Upload = symbol("Upload"),
  UserRound = symbol("UserRound"),
  ZoomIn = symbol("ZoomIn"),
  ZoomOut = symbol("ZoomOut");

export const Close = symbol("Close");
