import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Gamepad2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DEMO } from "@/lib/demo";

// Set once a visitor has gone to Play from the front page, so later visits open on the stars.
const PLAYED_KEY = "stard:played";

function playedBefore(): boolean {
  try {
    return localStorage.getItem(PLAYED_KEY) !== null;
  } catch {
    return false;
  }
}

function remember() {
  try {
    localStorage.setItem(PLAYED_KEY, new Date().toISOString());
  } catch {
    // Storage can be off (private windows); the button then shows again next visit.
  }
}

/** The demo's front page, on a first visit: a Play button beside the page title. */
export function PlayFirst() {
  const [shown] = useState(() => DEMO && !playedBefore());
  if (!shown) return null;
  return (
    <Link to="/run" onClick={remember} className={buttonVariants()}>
      <Gamepad2 /> Play
    </Link>
  );
}
