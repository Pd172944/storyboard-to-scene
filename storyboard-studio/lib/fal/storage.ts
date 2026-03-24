interface FalStorageUploadResponse {
  upload_url: string;
  file_url: string;
}

export async function uploadFileToFalStorage(file: File): Promise<string> {
  const initiateResp = await fetch("/api/fal/storage/upload/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_name: file.name,
      content_type: file.type,
    }),
  });

  if (!initiateResp.ok) {
    const errorBody = await initiateResp.text();
    throw new Error(`Failed to initiate upload: ${errorBody}`);
  }

  const { upload_url, file_url } = (await initiateResp.json()) as FalStorageUploadResponse;

  const uploadResp = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!uploadResp.ok) {
    throw new Error("Failed to upload file to fal storage");
  }

  return file_url;
}

export async function dataUrlToPngFile(dataUrl: string, filename: string): Promise<File> {
  const resp = await fetch(dataUrl);
  const blob = await resp.blob();

  return new File([blob], filename, {
    type: "image/png",
  });
}
