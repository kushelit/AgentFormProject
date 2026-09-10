/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";

const META_API_VERSION =
  "v25.0";

const META_GRAPH_URL =
  `https://graph.facebook.com/${META_API_VERSION}`;

const MAX_INBOUND_MEDIA_SIZE_BYTES =
  25 * 1024 * 1024;

export type WhatsAppInboundMediaType =
  | "image"
  | "document"
  | "video"
  | "audio"
  | "sticker";

export type StoredWhatsAppInboundMedia = {
  mediaId: string;
  type: WhatsAppInboundMediaType;
  mimeType: string;
  fileName: string;
  caption: string | null;
  storagePath: string;
  size: number;
  sha256: string | null;
};

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function sanitizePathPart(
  value: string,
  fallback: string
): string {
  const normalized =
    s(value)
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        "_"
      )
      .replace(
        /^_+|_+$/g,
        ""
      );

  return normalized || fallback;
}

function extensionFromMimeType(
  mimeType: string
): string {
  const mime =
    s(mimeType)
      .toLowerCase();

  const known:
    Record<string, string> = {
      "application/pdf":
        ".pdf",
      "image/jpeg":
        ".jpg",
      "image/png":
        ".png",
      "image/webp":
        ".webp",
      "video/mp4":
        ".mp4",
      "audio/ogg":
        ".ogg",
      "audio/mpeg":
        ".mp3",
      "audio/mp4":
        ".m4a",
      "audio/aac":
        ".aac",
      "audio/amr":
        ".amr",
    };

  return known[mime] || "";
}

function buildStoredFileName({
  mediaType,
  originalFileName,
  mimeType,
}: {
  mediaType:
    WhatsAppInboundMediaType;
  originalFileName:
    string;
  mimeType:
    string;
}): string {
  const normalizedOriginal =
    sanitizePathPart(
      originalFileName,
      ""
    );

  if (
    normalizedOriginal
  ) {
    return normalizedOriginal;
  }

  return `${mediaType}${extensionFromMimeType(
    mimeType
  )}`;
}

function getMessageMediaObject(
  message: any,
  mediaType:
    WhatsAppInboundMediaType
): any {
  return message?.[
    mediaType
  ] || null;
}

export function getWhatsAppInboundMediaDescriptor(
  message: any
): {
  mediaId: string;
  type: WhatsAppInboundMediaType;
  mimeType: string;
  fileName: string;
  caption: string | null;
} | null {
  const type =
    s(
      message?.type
    ).toLowerCase();

  if (
    ![
      "image",
      "document",
      "video",
      "audio",
      "sticker",
    ].includes(
      type
    )
  ) {
    return null;
  }

  const mediaType =
    type as WhatsAppInboundMediaType;

  const media =
    getMessageMediaObject(
      message,
      mediaType
    );

  const mediaId =
    s(
      media?.id
    );

  if (!mediaId) {
    return null;
  }

  return {
    mediaId,
    type:
      mediaType,
    mimeType:
      s(
        media?.mime_type
      ).toLowerCase(),
    fileName:
      s(
        media?.filename
      ),
    caption:
      s(
        media?.caption
      ) ||
      null,
  };
}

export async function downloadWhatsAppInboundMediaToStorage({
  agentId,
  conversationId,
  message,
  accessToken,
}: {
  agentId: string;
  conversationId: string;
  message: any;
  accessToken: string;
}): Promise<StoredWhatsAppInboundMedia | null> {
  const descriptor =
    getWhatsAppInboundMediaDescriptor(
      message
    );

  if (!descriptor) {
    return null;
  }

  if (
    !agentId ||
    !conversationId ||
    !accessToken
  ) {
    throw new Error(
      "Missing WhatsApp media download context"
    );
  }

  const metadataResponse =
    await fetch(
      `${META_GRAPH_URL}/${encodeURIComponent(
        descriptor.mediaId
      )}`,
      {
        method:
          "GET",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      }
    );

  const metadataText =
    await metadataResponse.text();

  let metadataJson:
    any = null;

  try {
    metadataJson =
      metadataText
        ? JSON.parse(
            metadataText
          )
        : null;
  } catch {
    metadataJson = {
      raw:
        metadataText,
    };
  }

  if (
    !metadataResponse.ok
  ) {
    throw new Error(
      `Meta media metadata request failed (${metadataResponse.status}): ${metadataText}`
    );
  }

  const mediaUrl =
    s(
      metadataJson?.url
    );

  if (!mediaUrl) {
    throw new Error(
      "Meta media metadata response is missing url"
    );
  }

  const resolvedMimeType =
    s(
      metadataJson
        ?.mime_type
    ).toLowerCase() ||
    descriptor.mimeType ||
    "application/octet-stream";

  const reportedSize =
    Number(
      metadataJson
        ?.file_size ||
      0
    );

  if (
    Number.isFinite(
      reportedSize
    ) &&
    reportedSize >
      MAX_INBOUND_MEDIA_SIZE_BYTES
  ) {
    throw new Error(
      `WhatsApp inbound media is too large (${reportedSize} bytes)`
    );
  }

  const mediaResponse =
    await fetch(
      mediaUrl,
      {
        method:
          "GET",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      }
    );

  if (
    !mediaResponse.ok
  ) {
    const errorText =
      await mediaResponse.text();

    throw new Error(
      `Meta media download failed (${mediaResponse.status}): ${errorText}`
    );
  }

  const arrayBuffer =
    await mediaResponse.arrayBuffer();

  const fileBuffer =
    Buffer.from(
      arrayBuffer
    );

  if (
    !fileBuffer.length
  ) {
    throw new Error(
      "Downloaded WhatsApp media is empty"
    );
  }

  if (
    fileBuffer.length >
    MAX_INBOUND_MEDIA_SIZE_BYTES
  ) {
    throw new Error(
      `WhatsApp inbound media is too large (${fileBuffer.length} bytes)`
    );
  }

  const storedFileName =
    buildStoredFileName({
      mediaType:
        descriptor.type,
      originalFileName:
        descriptor.fileName,
      mimeType:
        resolvedMimeType,
    });

  const storagePath =
    [
      "agents",
      sanitizePathPart(
        agentId,
        "agent"
      ),
      "whatsapp-inbound-media",
      sanitizePathPart(
        conversationId,
        "conversation"
      ),
      `${randomUUID()}-${storedFileName}`,
    ].join("/");

  const storageFile =
    getStorage()
      .bucket()
      .file(
        storagePath
      );

  await storageFile.save(
    fileBuffer,
    {
      resumable:
        false,
      contentType:
        resolvedMimeType,
      metadata: {
        contentType:
          resolvedMimeType,
        metadata: {
          agentId,
          conversationId,
          whatsappMediaId:
            descriptor.mediaId,
          mediaType:
            descriptor.type,
          originalFileName:
            descriptor.fileName ||
            storedFileName,
          source:
            "whatsapp_inbound",
        },
      },
    }
  );

  return {
    mediaId:
      descriptor.mediaId,
    type:
      descriptor.type,
    mimeType:
      resolvedMimeType,
    fileName:
      descriptor.fileName ||
      storedFileName,
    caption:
      descriptor.caption,
    storagePath,
    size:
      fileBuffer.length,
    sha256:
      s(
        metadataJson
          ?.sha256
      ) ||
      null,
  };
}
