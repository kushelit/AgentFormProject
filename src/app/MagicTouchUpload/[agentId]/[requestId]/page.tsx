import PublicDocumentUploadPage from "@/components/MagicTouch/Documents/PublicDocumentUploadPage";

export default function Page({
  params,
  searchParams,
}: {
  params: {agentId: string; requestId: string};
  searchParams: {token?: string};
}) {
  return (
    <PublicDocumentUploadPage
      agentId={String(params.agentId || "")}
      requestId={String(params.requestId || "")}
      token={String(searchParams.token || "")}
    />
  );
}
