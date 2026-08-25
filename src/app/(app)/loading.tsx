import LoadingScreen from "@/components/LoadingScreen";

/**
 * Shown in the content area while a page's data loads. The sidebar and header
 * stay put: navigation inside the app should never blank the whole window.
 */
export default function AppLoading() {
  return <LoadingScreen label="Loading page" />;
}
