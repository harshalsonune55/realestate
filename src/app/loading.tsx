import LoadingScreen from "@/components/LoadingScreen";

/**
 * Covers the whole viewport, because at this point the app chrome itself is
 * still being resolved — there is no sidebar to sit inside yet.
 */
export default function RootLoading() {
  return <LoadingScreen full label="Loading Aber Group" />;
}
