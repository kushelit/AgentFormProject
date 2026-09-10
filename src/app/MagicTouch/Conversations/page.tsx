'use client';

/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import Link from 'next/link';

import {
  httpsCallable,
} from 'firebase/functions';

import {
  functions,
} from '@/lib/firebase/firebase';

import {
  useMagicTouchAgent,
} from '@/components/MagicTouch/MagicTouchAgentContext';

import {
  useMagicTouchConversations,
  magicTouchConversationValueToDate,
  type MagicTouchConversation,
  type MagicTouchConversationMessage,
  type MagicTouchConversationFilter,
} from '@/hooks/useMagicTouchConversations';

type SendMessageResponse = {
  ok: boolean;
  action?: 'text' | 'media' | 'reaction';
  agentId: string;
  contactId: string | null;
  conversationId: string;
  waMessageId: string;
  media?: {
    mediaId?: string | null;
    type?: string | null;
    mimeType?: string | null;
    fileName?: string | null;
    caption?: string | null;
    storagePath?: string | null;
    size?: number | null;
  } | null;
  reactionEmoji?: string | null;
  reactionToWaMessageId?: string | null;
};

type GetWhatsAppMediaUrlResponse = {
  ok: boolean;
  agentId: string;
  conversationId: string;
  messageId: string;
  url: string;
  expiresAt: number;
  media?: {
    type?: string | null;
    mimeType?: string | null;
    fileName?: string | null;
    caption?: string | null;
    size?: number | null;
  };
};

type ResolveHumanAttentionResponse = {
  ok: boolean;

  mode:
    | 'handled'
    | 'continue_flow';

  conversationId: string;

  agentId: string;

  runId: string | null;

  resumed: boolean;

  resolvedAction?: string;

  resolutionType?: string;

  surenseCustomerId?:
    string |
    null;

  eventId?: string;

  resumeStepId?: string;
};

type SurenseCustomerCandidate = {
  customerId?:
    string |
    null;

  fullName?:
    string |
    null;

  idNumber?:
    string |
    null;

  phone?:
    string |
    null;

  email?:
    string |
    null;
};

type HumanAttentionContext = {
  provider?:
    string |
    null;

  action?:
    string |
    null;

  reason?:
    string |
    null;

  contactId?:
    string |
    null;

  requestId?:
    string |
    null;

  searchedFullName?:
    string |
    null;

  matchCount?:
    number |
    null;

  candidates?:
    SurenseCustomerCandidate[];
};

type HumanAttentionView =
  NonNullable<
    MagicTouchConversation[
      'humanAttention'
    ]
  > & {
    waitingForType?:
      string |
      null;

    reason?:
      string |
      null;

    context?:
      HumanAttentionContext |
      null;
  };

type ConversationHoverPreview = {
  text: string;
  direction:
    | 'inbound'
    | 'outbound'
    | null;
  customerName: string;
  top: number;
  left: number;
};

const MESSAGE_EMOJIS = [
  '😀',
  '😁',
  '😂',
  '🤣',
  '😊',
  '😍',
  '🥰',
  '😘',
  '🙂',
  '😉',
  '🤗',
  '🤔',
  '😅',
  '😢',
  '😭',
  '😡',
  '👍',
  '👎',
  '👏',
  '🙏',
  '💪',
  '👌',
  '✌️',
  '🤝',
  '❤️',
  '💙',
  '💚',
  '💛',
  '💜',
  '🔥',
  '🎉',
  '✨',
  '✅',
  '⭐',
  '📞',
  '📅',
  '📄',
  '📎',
  '💬',
  '🙌',
];

const REACTION_EMOJIS = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '🙏',
];

const MAX_MANUAL_ATTACHMENT_BYTES =
  18 * 1024 * 1024;

function fileToBase64(
  file: File
): Promise<string> {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const reader =
        new FileReader();

      reader.onload =
        () => {
          const result =
            String(
              reader.result ||
              ''
            );

          const commaIndex =
            result.indexOf(
              ','
            );

          if (
            commaIndex <
            0
          ) {
            reject(
              new Error(
                'לא ניתן היה לקרוא את הקובץ.'
              )
            );

            return;
          }

          resolve(
            result.slice(
              commaIndex +
              1
            )
          );
        };

      reader.onerror =
        () => {
          reject(
            new Error(
              'לא ניתן היה לקרוא את הקובץ.'
            )
          );
        };

      reader.readAsDataURL(
        file
      );
    }
  );
}

function guessMimeType(
  file: File
): string {
  const direct =
    String(
      file.type ||
      ''
    ).trim();

  if (
    direct
  ) {
    return direct;
  }

  const extension =
    String(
      file.name ||
      ''
    )
      .split('.')
      .pop()
      ?.toLowerCase() ||
    '';

  const byExtension:
    Record<string, string> = {
      pdf:
        'application/pdf',
      doc:
        'application/msword',
      docx:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls:
        'application/vnd.ms-excel',
      xlsx:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt:
        'application/vnd.ms-powerpoint',
      pptx:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt:
        'text/plain',
      csv:
        'text/csv',
      jpg:
        'image/jpeg',
      jpeg:
        'image/jpeg',
      png:
        'image/png',
      mp4:
        'video/mp4',
      mp3:
        'audio/mpeg',
      m4a:
        'audio/mp4',
      ogg:
        'audio/ogg',
      aac:
        'audio/aac',
      amr:
        'audio/amr',
    };

  return (
    byExtension[
      extension
    ] ||
    'application/octet-stream'
  );
}

function resolveClientMediaType(
  mimeType: string
):
  | 'image'
  | 'document'
  | 'video'
  | 'audio' {
  const normalized =
    String(
      mimeType ||
      ''
    ).toLowerCase();

  if (
    normalized.startsWith(
      'image/'
    )
  ) {
    return 'image';
  }

  if (
    normalized.startsWith(
      'video/'
    )
  ) {
    return 'video';
  }

  if (
    normalized.startsWith(
      'audio/'
    )
  ) {
    return 'audio';
  }

  return 'document';
}

function formatPhoneNumber(
  phone: string
): string {
  const digits =
    String(
      phone ||
      ''
    )
      .replace(
        /\D/g,
        ''
      );

  if (
    !digits
  ) {
    return '—';
  }

  let local =
    digits;

  if (
    local.startsWith(
      '972'
    )
  ) {
    local =
      `0${local.slice(3)}`;
  } else if (
    !local.startsWith(
      '0'
    )
  ) {
    local =
      `0${local}`;
  }

  return local.replace(
    /(\d{3})(\d+)/,
    '$1-$2'
  );
}

function formatConversationDate(
  value: unknown
): string {
  const date =
    magicTouchConversationValueToDate(
      value
    );

  if (
    !date
  ) {
    return '';
  }

  const now =
    new Date();

  const isToday =
    date.getFullYear() ===
      now.getFullYear() &&
    date.getMonth() ===
      now.getMonth() &&
    date.getDate() ===
      now.getDate();

  if (
    isToday
  ) {
    return date.toLocaleTimeString(
      'he-IL',
      {
        hour:
          '2-digit',

        minute:
          '2-digit',
      }
    );
  }

  return date.toLocaleDateString(
    'he-IL'
  );
}

function formatMessageTime(
  value: unknown
): string {
  const date =
    magicTouchConversationValueToDate(
      value
    );

  if (
    !date
  ) {
    return '';
  }

  return date.toLocaleTimeString(
    'he-IL',
    {
      hour:
        '2-digit',

      minute:
        '2-digit',
    }
  );
}

function getLatestReactionEmoji(
  messages:
    MagicTouchConversationMessage[],
  targetWaMessageId:
    string |
    null |
    undefined
): string | null {
  const targetId =
    String(
      targetWaMessageId ||
      ''
    ).trim();

  if (!targetId) {
    return null;
  }

  let latestEmoji:
    string | null =
    null;

  for (
    const currentMessage of
    messages
  ) {
    if (
      currentMessage.type !==
        'reaction' ||
      currentMessage
        .reactionToWaMessageId !==
        targetId
    ) {
      continue;
    }

    latestEmoji =
      currentMessage
        .reactionEmoji ||
      null;
  }

  return latestEmoji;
}

function getMessageText(
  message:
    MagicTouchConversationMessage
): string {
  if (
    message.text
  ) {
    return message.text;
  }

  if (
    message.type ===
    'template'
  ) {
    return message.templateName
      ? `נשלחה תבנית WhatsApp: ${message.templateName}`
      : 'נשלחה תבנית WhatsApp';
  }

  return message.type
    ? `[${message.type}]`
    : '[הודעה]';
}

function formatFileSize(
  value:
    number |
    null |
    undefined
): string {
  const size =
    Number(
      value ||
      0
    );

  if (
    !Number.isFinite(
      size
    ) ||
    size <= 0
  ) {
    return '';
  }

  if (
    size < 1024
  ) {
    return `${size} B`;
  }

  if (
    size <
    1024 * 1024
  ) {
    return `${(
      size / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    size /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function WhatsAppMediaMessage({
  conversationId,
  message,
}: {
  conversationId: string;
  message:
    MagicTouchConversationMessage;
}) {
  const [
    mediaUrl,
    setMediaUrl,
  ] =
    useState('');

  const [
    isLoadingMedia,
    setIsLoadingMedia,
  ] =
    useState(false);

  const [
    mediaError,
    setMediaError,
  ] =
    useState('');

  const media =
    message.media;

  useEffect(() => {
    if (
      !conversationId ||
      !message.id ||
      !media?.storagePath
    ) {
      setMediaUrl('');
      setMediaError('');
      setIsLoadingMedia(false);
      return;
    }

    let cancelled =
      false;

    const loadMediaUrl =
      async () => {
        setIsLoadingMedia(
          true
        );

        setMediaError(
          ''
        );

        try {
          const fn =
            httpsCallable<
              {
                conversationId:
                  string;
                messageId:
                  string;
              },
              GetWhatsAppMediaUrlResponse
            >(
              functions,
              'getMagicTouchWhatsAppMediaUrl'
            );

          const result =
            await fn({
              conversationId,
              messageId:
                message.id,
            });

          if (
            cancelled
          ) {
            return;
          }

          setMediaUrl(
            String(
              result.data?.url ||
              ''
            )
          );
        } catch (
          error: unknown
        ) {
          console.error(
            '[MagicTouchConversationsPage] Failed to load WhatsApp media URL',
            error
          );

          if (
            cancelled
          ) {
            return;
          }

          const errorText =
            error instanceof Error
              ? error.message
              : '';

          setMediaError(
            errorText ||
            'לא ניתן היה לפתוח את הקובץ.'
          );
        } finally {
          if (
            !cancelled
          ) {
            setIsLoadingMedia(
              false
            );
          }
        }
      };

    void loadMediaUrl();

    return () => {
      cancelled =
        true;
    };
  }, [
    conversationId,
    message.id,
    media?.storagePath,
  ]);

  if (!media) {
    return null;
  }

  const mediaType =
    String(
      media.type ||
      message.type ||
      ''
    ).toLowerCase();

  const fileName =
    String(
      media.fileName ||
      (
        mediaType ===
          'image'
          ? 'תמונה'
          : mediaType ===
              'sticker'
            ? 'סטיקר'
            : mediaType ===
                'video'
              ? 'וידאו'
              : mediaType ===
                  'audio'
                ? 'הודעה קולית'
                : 'מסמך'
      )
    );

  const caption =
    String(
      media.caption ||
      ''
    ).trim();

  const fileSize =
    formatFileSize(
      media.size
    );

  if (
    isLoadingMedia
  ) {
    return (
      <div className="rounded-xl bg-black/5 px-3 py-4 text-center text-xs text-slate-500">
        טוען קובץ...
      </div>
    );
  }

  if (
    mediaError ||
    !mediaUrl
  ) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
        <div className="font-bold">
          לא ניתן להציג את הקובץ
        </div>

        <div className="mt-1 break-words">
          {fileName}
        </div>

        {caption ? (
          <div className="mt-2 whitespace-pre-wrap text-slate-700">
            {caption}
          </div>
        ) : null}
      </div>
    );
  }

  if (
    mediaType ===
    'sticker'
  ) {
    return (
      <div className="flex justify-center py-1">
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block"
          title="פתיחת הסטיקר"
        >
          <img
            src={mediaUrl}
            alt="סטיקר"
            className="max-h-[180px] max-w-[180px] object-contain"
          />
        </a>
      </div>
    );
  }

  if (
    mediaType ===
    'image'
  ) {
    return (
      <div>
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-xl bg-slate-100"
          title="פתיחת התמונה"
        >
          <img
            src={mediaUrl}
            alt={caption || fileName}
            className="max-h-[360px] w-full object-contain"
          />
        </a>

        {caption ? (
          <div className="mt-2 whitespace-pre-wrap leading-5">
            {caption}
          </div>
        ) : null}
      </div>
    );
  }

  if (
    mediaType ===
    'video'
  ) {
    return (
      <div>
        <video
          src={mediaUrl}
          controls
          preload="metadata"
          className="max-h-[360px] w-full rounded-xl bg-black"
        />

        {caption ? (
          <div className="mt-2 whitespace-pre-wrap leading-5">
            {caption}
          </div>
        ) : null}
      </div>
    );
  }

  if (
    mediaType ===
    'audio'
  ) {
    return (
      <div className="min-w-[240px]">
        <div className="mb-2 text-xs font-semibold text-slate-600">
          🎤 הודעה קולית
        </div>

        <audio
          src={mediaUrl}
          controls
          preload="metadata"
          className="w-full"
        />
      </div>
    );
  }

  return (
    <div>
      <a
        href={mediaUrl}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-[230px] items-center gap-3 rounded-xl bg-black/5 px-3 py-3 transition hover:bg-black/10"
        title="פתיחת הקובץ"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl shadow-sm">
          📄
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-slate-800">
            {fileName}
          </div>

          <div className="mt-0.5 text-[11px] text-slate-500">
            {[media.mimeType, fileSize]
              .filter(Boolean)
              .join(' · ') ||
              'מסמך'}
          </div>
        </div>

        <div className="text-lg text-slate-500">
          ↗
        </div>
      </a>

      {caption ? (
        <div className="mt-2 whitespace-pre-wrap leading-5">
          {caption}
        </div>
      ) : null}
    </div>
  );
}

function MessageContent({
  conversationId,
  message,
}: {
  conversationId: string;
  message:
    MagicTouchConversationMessage;
}) {
  if (
    message.type ===
    'reaction'
  ) {
    return (
      <div
        className="py-1 text-3xl leading-none"
        title={
          message.reactionToWaMessageId
            ? 'תגובה להודעה קודמת'
            : undefined
        }
      >
        {message.reactionEmoji ||
          'תגובה הוסרה'}
      </div>
    );
  }

  if (
    message.media
      ?.storagePath
  ) {
    return (
      <WhatsAppMediaMessage
        conversationId={
          conversationId
        }
        message={
          message
        }
      />
    );
  }

  if (
    message.mediaDownloadError &&
    [
      'image',
      'document',
      'video',
      'audio',
      'sticker',
    ].includes(
      String(
        message.type ||
        ''
      )
    )
  ) {
    return (
      <div>
        <div className="font-semibold text-amber-700">
          הקובץ התקבל אך לא נשמר בהצלחה.
        </div>

        <div className="mt-1 whitespace-pre-wrap">
          {getMessageText(
            message
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="whitespace-pre-wrap">
      {getMessageText(
        message
      )}
    </div>
  );
}

function isServiceWindowOpen(
  conversation:
    | MagicTouchConversation
    | null
): boolean {
  const inboundDate =
    magicTouchConversationValueToDate(
      conversation
        ?.lastInboundAt
    );

  if (
    !inboundDate
  ) {
    return false;
  }

  const diffMs =
    Date.now() -
    inboundDate.getTime();

  return (
    diffMs <
    24 *
      60 *
      60 *
      1000
  );
}

function getCandidateTitle(
  candidate:
    SurenseCustomerCandidate
): string {
  const fullName =
    String(
      candidate
        .fullName ||
      ''
    ).trim();

  const customerId =
    String(
      candidate
        .customerId ||
      ''
    ).trim();

  if (
    fullName &&
    customerId
  ) {
    return `${fullName} · ${customerId}`;
  }

  return (
    fullName ||
    customerId ||
    'לקוח Surense'
  );
}

export default function MagicTouchConversationsPage() {
  const {
    selectedAgentId,
  } =
    useMagicTouchAgent();

  const agentId =
    selectedAgentId;

  const {
    conversations,
    filteredConversations,

    selectedConversation,
    selectedConversationId,

    messages,

    search,
    setSearch,

    conversationFilter,
    setConversationFilter,

    isLoadingConversations,
    isLoadingMessages,
    isRefreshing,

    refreshConversations,

    errorMessage:
      conversationsError,

    clearError:
      clearConversationsError,

    waitingForReplyCount,
    unreadConversationCount,
    humanAttentionCount,

    selectConversation,
  } =
    useMagicTouchConversations(
      agentId
    );

  const [
    replyText,
    setReplyText,
  ] =
    useState('');

  const [
    selectedFile,
    setSelectedFile,
  ] =
    useState<File | null>(
      null
    );

  const [
    isEmojiPickerOpen,
    setIsEmojiPickerOpen,
  ] =
    useState(false);

  const [
    reactionTargetWaMessageId,
    setReactionTargetWaMessageId,
  ] =
    useState('');

  const [
    isSendingReaction,
    setIsSendingReaction,
  ] =
    useState(false);

  const textareaRef =
    useRef<HTMLTextAreaElement | null>(
      null
    );

  const fileInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const [
    isSending,
    setIsSending,
  ] =
    useState(false);

  const [
    sendErrorMessage,
    setSendErrorMessage,
  ] =
    useState('');

  const [
    isResolvingAttention,
    setIsResolvingAttention,
  ] =
    useState(false);

  const [
    manualSurenseCustomerId,
    setManualSurenseCustomerId,
  ] =
    useState('');

  const [
    hoverPreview,
    setHoverPreview,
  ] =
    useState<
      ConversationHoverPreview |
      null
    >(null);

  const [
    requestedConversationId,
    setRequestedConversationId,
  ] =
    useState('');

  const [
    openedRequestedConversationId,
    setOpenedRequestedConversationId,
  ] =
    useState('');

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    setRequestedConversationId(
      String(
        params.get(
          'conversationId'
        ) ||
        ''
      ).trim()
    );
  }, []);

  useEffect(() => {
    if (
      !requestedConversationId ||
      openedRequestedConversationId ===
        requestedConversationId ||
      isLoadingConversations
    ) {
      return;
    }

    const exists =
      conversations.some(
        (
          conversation
        ) =>
          conversation.id ===
          requestedConversationId
      );

    if (!exists) {
      return;
    }

    setOpenedRequestedConversationId(
      requestedConversationId
    );

    setHoverPreview(
      null
    );

    setReplyText(
      ''
    );

    setSelectedFile(
      null
    );

    setIsEmojiPickerOpen(
      false
    );

    setReactionTargetWaMessageId(
      ''
    );

    setManualSurenseCustomerId(
      ''
    );

    setSendErrorMessage(
      ''
    );

    clearConversationsError();

    void selectConversation(
      requestedConversationId
    );
  }, [
    conversations,
    isLoadingConversations,
    requestedConversationId,
    openedRequestedConversationId,
    selectConversation,
    clearConversationsError,
  ]);

  const errorMessage =
    sendErrorMessage ||
    conversationsError;

  const serviceWindowOpen =
    isServiceWindowOpen(
      selectedConversation
    );

  const humanAttention =
    selectedConversation
      ?.humanAttention as
      | HumanAttentionView
      | undefined;

  const humanAttentionContext =
    humanAttention
      ?.context ||
    null;

  const isSurenseFindCustomerAttention =
    humanAttention
      ?.waitingForType ===
      'human_attention' &&
    humanAttentionContext
      ?.provider ===
      'surense' &&
    humanAttentionContext
      ?.action ===
      'findCustomer';

  const surenseMatchCount =
    Number(
      humanAttentionContext
        ?.matchCount ??
      0
    );

  const surenseCandidates =
    Array.isArray(
      humanAttentionContext
        ?.candidates
    )
      ? humanAttentionContext
          .candidates
      : [];

  const searchedFullName =
    String(
      humanAttentionContext
        ?.searchedFullName ||
      selectedConversation
        ?.customerName ||
      ''
    ).trim();

  const handleConversationMouseEnter =
    (
      event:
        React.MouseEvent<HTMLButtonElement>,
      conversation:
        MagicTouchConversation
    ) => {
      const text =
        String(
          conversation
            .lastMessageText ||
          ''
        ).trim();

      if (
        !text
      ) {
        setHoverPreview(
          null
        );

        return;
      }

      const rect =
        event.currentTarget
          .getBoundingClientRect();

      const previewWidth =
        330;

      const previewHeight =
        150;

      const gap =
        12;

      let left =
        rect.left -
        previewWidth -
        gap;

      if (
        left <
        12
      ) {
        left =
          rect.right +
          gap;
      }

      if (
        left +
          previewWidth >
        window.innerWidth -
          12
      ) {
        left =
          Math.max(
            12,
            window.innerWidth -
              previewWidth -
              12
          );
      }

      let top =
        rect.top;

      if (
        top +
          previewHeight >
        window.innerHeight -
          12
      ) {
        top =
          Math.max(
            12,
            window.innerHeight -
              previewHeight -
              12
          );
      }

      setHoverPreview({
        text,

        direction:
          conversation
            .lastMessageDirection ||
          null,

        customerName:
          conversation.customerName ||
          formatPhoneNumber(
            conversation.customerPhone
          ),

        top,

        left,
      });
    };

  const handleConversationMouseLeave =
    () => {
      setHoverPreview(
        null
      );
    };

  const handleSelectConversation =
    async (
      conversationId:
        string
    ) => {
      setHoverPreview(
        null
      );

      setReplyText(
        ''
      );

      setSelectedFile(
        null
      );

      setIsEmojiPickerOpen(
        false
      );

      setReactionTargetWaMessageId(
        ''
      );

      setManualSurenseCustomerId(
        ''
      );

      setSendErrorMessage(
        ''
      );

      clearConversationsError();

      await selectConversation(
        conversationId
      );
    };

  const insertEmoji =
    (
      emoji:
        string
    ) => {
      const textarea =
        textareaRef.current;

      if (
        !textarea
      ) {
        setReplyText(
          (
            current
          ) =>
            `${current}${emoji}`
        );

        return;
      }

      const start =
        textarea.selectionStart ??
        replyText.length;

      const end =
        textarea.selectionEnd ??
        replyText.length;

      const nextText =
        `${replyText.slice(
          0,
          start
        )}${emoji}${replyText.slice(
          end
        )}`;

      setReplyText(
        nextText
      );

      requestAnimationFrame(
        () => {
          textarea.focus();

          const nextPosition =
            start +
            emoji.length;

          textarea.setSelectionRange(
            nextPosition,
            nextPosition
          );
        }
      );
    };

  const handleFileSelected =
    (
      file:
        File |
        null
    ) => {
      setSendErrorMessage(
        ''
      );

      if (
        !file
      ) {
        setSelectedFile(
          null
        );

        return;
      }

      if (
        file.size >
        MAX_MANUAL_ATTACHMENT_BYTES
      ) {
        setSelectedFile(
          null
        );

        setSendErrorMessage(
          'הקובץ גדול מדי. ניתן לשלוח קובץ עד 18MB.'
        );

        return;
      }

      setSelectedFile(
        file
      );

      setIsEmojiPickerOpen(
        false
      );
    };

  const sendReply =
    async () => {
      const text =
        replyText.trim();

      if (
        !selectedConversationId ||
        (
          !text &&
          !selectedFile
        ) ||
        isSending
      ) {
        return;
      }

      if (
        !serviceWindowOpen
      ) {
        setSendErrorMessage(
          'חלפו יותר מ־24 שעות מהודעת הלקוח האחרונה. יש לשלוח תבנית WhatsApp מאושרת.'
        );

        return;
      }

      setIsSending(
        true
      );

      setSendErrorMessage(
        ''
      );

      setIsEmojiPickerOpen(
        false
      );

      clearConversationsError();

      try {
        const fn =
          httpsCallable<
            {
              conversationId:
                string;

              action?:
                'text' |
                'media';

              text?:
                string;

              media?: {
                fileName:
                  string;

                mimeType:
                  string;

                base64:
                  string;

                type:
                  'image' |
                  'document' |
                  'video' |
                  'audio';
              };
            },
            SendMessageResponse
          >(
            functions,
            'sendWhatsAppConversationMessage'
          );

        if (
          selectedFile
        ) {
          const mimeType =
            guessMimeType(
              selectedFile
            );

          const base64 =
            await fileToBase64(
              selectedFile
            );

          await fn({
            conversationId:
              selectedConversationId,

            action:
              'media',

            text,

            media: {
              fileName:
                selectedFile.name,

              mimeType,

              base64,

              type:
                resolveClientMediaType(
                  mimeType
                ),
            },
          });

          setSelectedFile(
            null
          );

          if (
            fileInputRef.current
          ) {
            fileInputRef.current.value =
              '';
          }

          setReplyText(
            ''
          );

          return;
        }

        await fn({
          conversationId:
            selectedConversationId,

          action:
            'text',

          text,
        });

        setReplyText(
          ''
        );
      } catch (
        error: unknown
      ) {
        console.error(
          '[MagicTouchConversationsPage] Failed to send message',
          error
        );

        const message =
          error instanceof Error
            ? error.message
            : '';

        setSendErrorMessage(
          message ||
          'לא ניתן היה לשלוח את ההודעה.'
        );
      } finally {
        setIsSending(
          false
        );
      }
    };

  const sendReaction =
    async (
      targetWaMessageId:
        string,
      emoji:
        string
    ) => {
      if (
        !selectedConversationId ||
        !targetWaMessageId ||
        !emoji ||
        isSendingReaction
      ) {
        return;
      }

      if (
        !serviceWindowOpen
      ) {
        setSendErrorMessage(
          'חלפו יותר מ־24 שעות מהודעת הלקוח האחרונה. לא ניתן לשלוח תגובה להודעה.'
        );

        return;
      }

      setIsSendingReaction(
        true
      );

      setSendErrorMessage(
        ''
      );

      clearConversationsError();

      try {
        const fn =
          httpsCallable<
            {
              conversationId:
                string;

              action:
                'reaction';

              reaction: {
                messageId:
                  string;

                emoji:
                  string;
              };
            },
            SendMessageResponse
          >(
            functions,
            'sendWhatsAppConversationMessage'
          );

        await fn({
          conversationId:
            selectedConversationId,

          action:
            'reaction',

          reaction: {
            messageId:
              targetWaMessageId,

            emoji,
          },
        });

        setReactionTargetWaMessageId(
          ''
        );
      } catch (
        error: unknown
      ) {
        console.error(
          '[MagicTouchConversationsPage] Failed to send reaction',
          error
        );

        const message =
          error instanceof Error
            ? error.message
            : '';

        setSendErrorMessage(
          message ||
          'לא ניתן היה לשלוח את התגובה.'
        );
      } finally {
        setIsSendingReaction(
          false
        );
      }
    };

  const resolveHumanAttention =
    async ({
      mode,
      resolvedAction,
      surenseCustomerId,
    }: {
      mode:
        | 'handled'
        | 'continue_flow';

      resolvedAction?:
        string;

      surenseCustomerId?:
        string;
    }) => {
      if (
        !selectedConversationId ||
        isResolvingAttention
      ) {
        return;
      }

      setIsResolvingAttention(
        true
      );

      setSendErrorMessage(
        ''
      );

      clearConversationsError();

      try {
        const fn =
          httpsCallable<
            {
              conversationId:
                string;

              mode:
                | 'handled'
                | 'continue_flow';

              resolvedAction?:
                string;

              surenseCustomerId?:
                string;
            },
            ResolveHumanAttentionResponse
          >(
            functions,
            'resolveMagicTouchHumanAttention'
          );

        await fn({
          conversationId:
            selectedConversationId,

          mode,

          ...(
            resolvedAction
              ? {
                  resolvedAction,
                }
              : {}
          ),

          ...(
            surenseCustomerId
              ? {
                  surenseCustomerId,
                }
              : {}
          ),
        });

        setManualSurenseCustomerId(
          ''
        );
      } catch (
        error: unknown
      ) {
        console.error(
          '[MagicTouchConversationsPage] Failed to resolve human attention',
          error
        );

        const message =
          error instanceof Error
            ? error.message
            : '';

        setSendErrorMessage(
          message ||
          'לא ניתן היה לסיים את הטיפול בשיחה.'
        );
      } finally {
        setIsResolvingAttention(
          false
        );
      }
    };

  const getFilterButtonClass =
    (
      filter:
        MagicTouchConversationFilter
    ) => {
      const isActive =
        conversationFilter ===
        filter;

      return [
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5',
        'text-xs font-semibold transition',
        isActive
          ? 'border-green-600 bg-green-600 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-600 hover:border-green-300 hover:bg-green-50',
      ].join(' ');
    };

  return (
    <section
      dir="rtl"
      className="w-full"
    >
      {hoverPreview ? (
        <div
          className="pointer-events-none fixed z-[9999] w-[330px] rounded-xl border border-slate-200 bg-white p-3 text-right shadow-2xl"
          style={{
            top:
              hoverPreview.top,

            left:
              hoverPreview.left,
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="truncate text-xs font-bold text-slate-700">
              {
                hoverPreview.customerName
              }
            </div>

            <div
              className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                hoverPreview.direction ===
                'outbound'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {hoverPreview.direction ===
              'outbound'
                ? 'נשלחה'
                : 'התקבלה'}
            </div>
          </div>

          <div className="mt-2 max-h-[120px] overflow-hidden whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
            {
              hoverPreview.text
            }
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <div className="text-sm font-medium text-blue-700">
            Magic Touch
          </div>

          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            שיחות WhatsApp
          </h1>

          <p className="mt-2 text-slate-600">
            ניהול שיחות, הודעות נכנסות ומענה ללקוחות.
          </p>
        </header>

        {errorMessage ? (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                תיבת שיחות
              </h2>

              <div className="mt-1 text-sm text-slate-500">
                {conversations.length}{' '}
                שיחות
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  void refreshConversations()
                }
                disabled={
                  !agentId ||
                  isRefreshing
                }
                title="רענון שיחות"
                aria-label="רענון שיחות"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-green-300 hover:bg-green-50 hover:text-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-4 w-4 ${
                    isRefreshing
                      ? 'animate-spin'
                      : ''
                  }`}
                  aria-hidden="true"
                >
                  <path d="M20 6v6h-6" />
                  <path d="M4 18v-6h6" />
                  <path d="M18.5 9A7 7 0 0 0 6.4 6.4L4 9" />
                  <path d="M5.5 15A7 7 0 0 0 17.6 17.6L20 15" />
                </svg>
              </button>

              {waitingForReplyCount >
              0 ? (
                <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">
                  {
                    waitingForReplyCount
                  }{' '}
                  ממתינות למענה
                </span>
              ) : null}

              {humanAttentionCount >
              0 ? (
                <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-700">
                  🔴 {
                    humanAttentionCount
                  }{' '}
                  דורשות טיפול
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid min-h-[650px] grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="border-l bg-slate-50">
              <div className="border-b p-3">
                <input
                  type="search"
                  value={
                    search
                  }
                  onChange={(
                    event
                  ) =>
                    setSearch(
                      event
                        .target
                        .value
                    )
                  }
                  placeholder="חיפוש לפי שם, טלפון או הודעה"
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setConversationFilter(
                        'all'
                      )
                    }
                    className={getFilterButtonClass(
                      'all'
                    )}
                  >
                    <span>
                      כל השיחות
                    </span>

                    <span
                      className={
                        conversationFilter ===
                        'all'
                          ? 'text-white/80'
                          : 'text-slate-400'
                      }
                    >
                      {
                        conversations.length
                      }
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setConversationFilter(
                        'unread'
                      )
                    }
                    className={getFilterButtonClass(
                      'unread'
                    )}
                  >
                    <span>
                      לא נקראו
                    </span>

                    <span
                      className={
                        conversationFilter ===
                        'unread'
                          ? 'text-white/80'
                          : 'text-slate-400'
                      }
                    >
                      {
                        unreadConversationCount
                      }
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setConversationFilter(
                        'human_attention'
                      )
                    }
                    className={getFilterButtonClass(
                      'human_attention'
                    )}
                  >
                    <span>
                      דורשות טיפול
                    </span>

                    <span
                      className={
                        conversationFilter ===
                        'human_attention'
                          ? 'text-white/80'
                          : 'text-slate-400'
                      }
                    >
                      {
                        humanAttentionCount
                      }
                    </span>
                  </button>
                </div>
              </div>

              <div className="max-h-[610px] overflow-y-auto">
                {isLoadingConversations ? (
                  <div className="p-6 text-center text-sm text-slate-500">
                    טוען שיחות...
                  </div>
                ) : filteredConversations
                    .length ===
                  0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">
                    {conversationFilter ===
                    'unread'
                      ? 'אין שיחות שלא נקראו.'
                      : conversationFilter ===
                        'human_attention'
                      ? 'אין שיחות שדורשות טיפול.'
                      : 'אין שיחות להצגה.'}
                  </div>
                ) : (
                  filteredConversations.map(
                    (
                      conversation
                    ) => {
                      const isSelected =
                        conversation.id ===
                        selectedConversationId;

                      const unreadCount =
                        Number(
                          conversation.unreadCount ||
                          0
                        );

                      const needsHumanAttention =
                        conversation.needsHumanAttention ===
                          true ||
                        conversation.humanAttention
                          ?.required ===
                          true;

                      return (
                        <button
                          key={
                            conversation.id
                          }
                          type="button"
                          onMouseEnter={(
                            event
                          ) =>
                            handleConversationMouseEnter(
                              event,
                              conversation
                            )
                          }
                          onMouseLeave={
                            handleConversationMouseLeave
                          }
                          onClick={() =>
                            void handleSelectConversation(
                              conversation.id
                            )
                          }
                          className={`w-full border-b p-3 text-right transition hover:bg-white ${
                            isSelected
                              ? 'bg-white'
                              : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-100 font-bold text-green-700">
                              {(
                                conversation.customerName ||
                                conversation.customerPhone ||
                                '?'
                              ).slice(
                                0,
                                1
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div
                                  className={`truncate ${
                                    unreadCount >
                                    0
                                      ? 'font-bold'
                                      : 'font-semibold'
                                  }`}
                                >
                                  {conversation.customerName ||
                                    formatPhoneNumber(
                                      conversation.customerPhone
                                    )}
                                </div>

                                <div className="flex-shrink-0 text-xs text-slate-400">
                                  {formatConversationDate(
                                    conversation.lastMessageAt
                                  )}
                                </div>
                              </div>

                              <div
                                className="mt-0.5 text-xs text-slate-500"
                                dir="ltr"
                              >
                                {formatPhoneNumber(
                                  conversation.customerPhone
                                )}
                              </div>

                              {needsHumanAttention ? (
                                <div className="mt-1">
                                  <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                                    🔴 דורש טיפול
                                  </span>
                                </div>
                              ) : null}

                              <div className="mt-1 truncate text-sm text-slate-600">
                                {conversation.lastMessageDirection ===
                                'outbound'
                                  ? 'אתם: '
                                  : ''}

                                {conversation.lastMessageText ||
                                  '—'}
                              </div>
                            </div>

                            {unreadCount >
                            0 ? (
                              <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1 text-xs text-white">
                                {
                                  unreadCount
                                }
                              </div>
                            ) : null}
                          </div>
                        </button>
                      );
                    }
                  )
                )}
              </div>
            </aside>

            <main className="flex justify-center bg-[#e9f3ef] p-4">
              {!selectedConversation ? (
                <div className="self-center text-slate-500">
                  בחרי שיחה להצגה.
                </div>
              ) : (
                <div className="flex w-full max-w-[600px] flex-col overflow-hidden rounded-[24px] border bg-[#efeae2] shadow-xl">
                  <div className="flex items-center justify-between gap-3 bg-[#075e54] px-4 py-3 text-white">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20 font-bold">
                        {(
                          selectedConversation.customerName ||
                          selectedConversation.customerPhone ||
                          '?'
                        ).slice(
                          0,
                          1
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate font-bold">
                          {selectedConversation.customerName ||
                            formatPhoneNumber(
                              selectedConversation.customerPhone
                            )}
                        </div>

                        <div
                          className="text-xs opacity-80"
                          dir="ltr"
                        >
                          {formatPhoneNumber(
                            selectedConversation.customerPhone
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedConversation.contactId &&
                    agentId ? (
                      <Link
                        href={`/MagicTouch/Contacts/${encodeURIComponent(
                          selectedConversation.contactId
                        )}?agentId=${encodeURIComponent(
                          agentId
                        )}`}
                        className="rounded-lg bg-white/15 px-3 py-2 text-sm font-medium hover:bg-white/25"
                      >
                        צפייה באיש קשר
                      </Link>
                    ) : null}
                  </div>

                  {selectedConversation.needsHumanAttention ===
                    true ||
                  humanAttention
                    ?.required ===
                    true ? (
                    <div className="border-b border-red-200 bg-red-50 px-4 py-3">
                      <div className="flex items-center gap-2 font-bold text-red-800">
                        <span>
                          🔴
                        </span>

                        <span>
                          נדרשת התערבות שלך
                        </span>
                      </div>

                      {isSurenseFindCustomerAttention ? (
                        <>
                          <p className="mt-1 text-sm text-red-700">
                            {surenseMatchCount ===
                            0
                              ? 'MagicTouch לא מצא בשורנס לקוח תואם באופן אוטומטי.'
                              : 'MagicTouch מצא יותר מלקוח אחד מתאים בשורנס ולכן לא ניתן לבחור לקוח אוטומטית.'}
                          </p>

                          {searchedFullName ? (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                              <div className="text-xs font-semibold text-amber-700">
                                הלקוח שחיפשנו בשורנס
                              </div>

                              <div className="mt-1 font-bold text-slate-900">
                                {
                                  searchedFullName
                                }
                              </div>

                              <div className="mt-1 text-xs text-slate-600">
                                נמצאו{' '}
                                {
                                  surenseMatchCount
                                }{' '}
                                תוצאות.
                              </div>
                            </div>
                          ) : null}

                          {surenseMatchCount >
                            1 &&
                          surenseCandidates.length >
                            0 ? (
                            <div className="mt-4 rounded-xl border border-blue-100 bg-white p-3">
                              <div className="text-sm font-bold text-slate-800">
                                בחרי את הלקוח הנכון בשורנס
                              </div>

                              <div className="mt-1 text-xs text-slate-500">
                                הבחירה תשמור את מזהה הלקוח ותמשיך אוטומטית את ה־Flow ליצירת ייפוי הכוח.
                              </div>

                              <div className="mt-3 space-y-2">
                                {surenseCandidates.map(
                                  (
                                    candidate,
                                    index
                                  ) => {
                                    const customerId =
                                      String(
                                        candidate.customerId ||
                                        ''
                                      ).trim();

                                    return (
                                      <div
                                        key={
                                          customerId ||
                                          `candidate_${index}`
                                        }
                                        className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                                      >
                                        <div className="font-bold text-slate-900">
                                          {getCandidateTitle(
                                            candidate
                                          )}
                                        </div>

                                        <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                                          {candidate.idNumber ? (
                                            <div>
                                              ת״ז:{' '}
                                              <span className="font-semibold">
                                                {
                                                  candidate.idNumber
                                                }
                                              </span>
                                            </div>
                                          ) : null}

                                          {candidate.phone ? (
                                            <div>
                                              טלפון:{' '}
                                              <span className="font-semibold">
                                                {
                                                  candidate.phone
                                                }
                                              </span>
                                            </div>
                                          ) : null}

                                          {candidate.email ? (
                                            <div className="sm:col-span-2">
                                              מייל:{' '}
                                              <span className="font-semibold">
                                                {
                                                  candidate.email
                                                }
                                              </span>
                                            </div>
                                          ) : null}

                                          {customerId ? (
                                            <div className="sm:col-span-2">
                                              Surense Customer ID:{' '}
                                              <span className="font-mono font-semibold">
                                                {
                                                  customerId
                                                }
                                              </span>
                                            </div>
                                          ) : null}
                                        </div>

                                        <button
                                          type="button"
                                          disabled={
                                            isResolvingAttention ||
                                            !customerId
                                          }
                                          onClick={() =>
                                            void resolveHumanAttention({
                                              mode:
                                                'continue_flow',

                                              surenseCustomerId:
                                                customerId,
                                            })
                                          }
                                          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {isResolvingAttention
                                            ? 'ממשיך...'
                                            : 'בחר לקוח והמשך Flow'}
                                        </button>
                                      </div>
                                    );
                                  }
                                )}
                              </div>
                            </div>
                          ) : null}

                          {surenseMatchCount ===
                          0 ? (
                            <div className="mt-4 rounded-xl border border-blue-100 bg-white p-3">
                              <div className="text-sm font-bold text-slate-800">
                                הזנת מזהה Surense ידנית
                              </div>

                              <div className="mt-1 text-xs leading-5 text-slate-500">
                                לאחר שאיתרת את הלקוח בשורנס, הזיני כאן את מזהה הלקוח. המזהה יישמר על איש הקשר וה־Flow ימשיך ליצירת ייפוי הכוח.
                              </div>

                              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                <input
                                  type="text"
                                  value={
                                    manualSurenseCustomerId
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setManualSurenseCustomerId(
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  placeholder="Surense Customer ID"
                                  disabled={
                                    isResolvingAttention
                                  }
                                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                  dir="ltr"
                                />

                                <button
                                  type="button"
                                  disabled={
                                    isResolvingAttention ||
                                    !manualSurenseCustomerId.trim()
                                  }
                                  onClick={() =>
                                    void resolveHumanAttention({
                                      mode:
                                        'continue_flow',

                                      surenseCustomerId:
                                        manualSurenseCustomerId.trim(),
                                    })
                                  }
                                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isResolvingAttention
                                    ? 'ממשיך...'
                                    : 'שמור והמשך Flow'}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-[11px] leading-5 text-slate-500">
                            ה־Flow יישאר בהמתנה עד לבחירת לקוח או להזנת מזהה Surense תקין. המערכת לא תבחר לקוח אוטומטית כאשר קיימת יותר מהתאמה אחת.
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="mt-1 text-sm text-red-700">
                            MagicTouch לא הצליח להתאים את תשובת הלקוח להמשך התהליך באופן בטוח.
                          </p>

                          {humanAttention
                            ?.customerMessage ? (
                            <div className="mt-3 rounded-lg border border-red-100 bg-white px-3 py-2">
                              <div className="text-xs font-semibold text-slate-500">
                                הלקוח כתב
                              </div>

                              <div className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-800">
                                {
                                  humanAttention
                                    .customerMessage
                                }
                              </div>
                            </div>
                          ) : null}

                          {humanAttention
                            ?.question ? (
                            <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                              <div className="text-xs font-semibold text-amber-700">
                                התהליך עדיין ממתין לתשובה על
                              </div>

                              <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                                {
                                  humanAttention
                                    .question
                                }
                              </div>
                            </div>
                          ) : null}

                          {humanAttention
                            ?.flowName ? (
                            <div className="mt-2 text-xs text-slate-500">
                              תהליך:{' '}
                              <span className="font-semibold">
                                {
                                  humanAttention
                                    .flowName
                                }
                              </span>
                            </div>
                          ) : null}

                          {Array.isArray(
                            humanAttention
                              ?.expectedActions
                          ) &&
                          humanAttention
                            ?.expectedActions
                            ?.length ? (
                            <div className="mt-4 rounded-xl border border-blue-100 bg-white p-3">
                              <div className="text-xs font-bold text-slate-700">
                                להמשיך את ה־Flow לפי החלטתך
                              </div>

                              <div className="mt-2 flex flex-wrap gap-2">
                                {humanAttention
                                  .expectedActions
                                  .map(
                                    (
                                      action
                                    ) => {
                                      const option =
                                        humanAttention
                                          ?.responseOptions
                                          ?.find(
                                            (
                                              item
                                            ) =>
                                              item.action ===
                                              action
                                          );

                                      const label =
                                        option?.label ||
                                        action;

                                      return (
                                        <button
                                          key={
                                            action
                                          }
                                          type="button"
                                          disabled={
                                            isResolvingAttention
                                          }
                                          onClick={() =>
                                            void resolveHumanAttention({
                                              mode:
                                                'continue_flow',

                                              resolvedAction:
                                                action,
                                            })
                                          }
                                          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                          title={
                                            option?.description ||
                                            action
                                          }
                                        >
                                          {
                                            label
                                          }
                                        </button>
                                      );
                                    }
                                  )}
                              </div>

                              <div className="mt-2 text-[11px] text-slate-400">
                                בחירה כאן תפתור ידנית את ה־Action ותחדש את אותו Run מהמקום שבו נעצר.
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={
                                isResolvingAttention
                              }
                              onClick={() =>
                                void resolveHumanAttention({
                                  mode:
                                    'handled',
                                })
                              }
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isResolvingAttention
                                ? 'מעדכן...'
                                : '✓ טופל'}
                            </button>

                            <span className="text-[11px] text-slate-500">
                              &quot;טופל&quot; מסיר את ההתראה בלבד ואינו ממשיך את ה־Flow.
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}

                  <div className="h-[500px] flex-1 space-y-2 overflow-y-auto p-4">
                    {isLoadingMessages ? (
                      <div className="mt-10 text-center text-sm text-slate-500">
                        טוען הודעות...
                      </div>
                    ) : messages.length ===
                      0 ? (
                      <div className="mt-10 text-center text-sm text-slate-500">
                        אין הודעות בשיחה.
                      </div>
                    ) : (
                      messages.map(
                        (
                          message
                        ) => {
                          const isOutbound =
                            message.direction ===
                            'outbound';

                          const reactionTargetExists =
                            message.type ===
                              'reaction' &&
                            Boolean(
                              message
                                .reactionToWaMessageId
                            ) &&
                            messages.some(
                              (
                                candidate
                              ) =>
                                candidate.waMessageId ===
                                message.reactionToWaMessageId
                            );

                          if (
                            reactionTargetExists
                          ) {
                            return null;
                          }

                          const attachedReaction =
                            getLatestReactionEmoji(
                              messages,
                              message.waMessageId
                            );

                          return (
                            <div
                              key={
                                message.id
                              }
                              className={`flex ${
                                isOutbound
                                  ? 'justify-end'
                                  : 'justify-start'
                              }`}
                            >
                              <div
                                className={`group relative max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                                  isOutbound
                                    ? 'rounded-br-sm bg-[#dcf8c6]'
                                    : 'rounded-bl-sm bg-white'
                                }`}
                              >
                                {message.type !==
                                  'reaction' &&
                                message.waMessageId ? (
                                  <div
                                    className={`absolute -top-3 ${
                                      isOutbound
                                        ? '-left-8'
                                        : '-right-8'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReactionTargetWaMessageId(
                                          (
                                            current
                                          ) =>
                                            current ===
                                            message.waMessageId
                                              ? ''
                                              : String(
                                                  message.waMessageId ||
                                                    ''
                                                )
                                        )
                                      }
                                      disabled={
                                        !serviceWindowOpen ||
                                        isSendingReaction
                                      }
                                      title="תגובה להודעה"
                                      aria-label="תגובה להודעה"
                                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm shadow-sm opacity-0 transition hover:bg-slate-50 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                      😊
                                    </button>

                                    {reactionTargetWaMessageId ===
                                    message.waMessageId ? (
                                      <div
                                        className={`absolute top-8 z-30 flex gap-1 rounded-full border border-slate-200 bg-white p-1.5 shadow-xl ${
                                          isOutbound
                                            ? 'left-0'
                                            : 'right-0'
                                        }`}
                                      >
                                        {REACTION_EMOJIS.map(
                                          (
                                            emoji
                                          ) => (
                                            <button
                                              key={
                                                emoji
                                              }
                                              type="button"
                                              disabled={
                                                isSendingReaction
                                              }
                                              onClick={() =>
                                                void sendReaction(
                                                  String(
                                                    message.waMessageId ||
                                                      ''
                                                  ),
                                                  emoji
                                                )
                                              }
                                              className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition hover:bg-slate-100 disabled:opacity-40"
                                            >
                                              {
                                                emoji
                                              }
                                            </button>
                                          )
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}

                                <MessageContent
                                  conversationId={
                                    selectedConversationId
                                  }
                                  message={
                                    message
                                  }
                                />

                                <div className="mt-1 text-left text-[10px] text-slate-500">
                                  {formatMessageTime(
                                    message.createdAt
                                  )}

                                  {isOutbound &&
                                  message.status
                                    ? ` · ${message.status}`
                                    : ''}
                                </div>

                                {attachedReaction ? (
                                  <div className="absolute -bottom-3 left-2 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-sm leading-none shadow-sm">
                                    {attachedReaction}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        }
                      )
                    )}
                  </div>

                  <div className="bg-slate-100 p-3">
                    {!serviceWindowOpen ? (
                      <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        חלפו יותר מ־24 שעות מהודעת הלקוח האחרונה. כדי לחדש את השיחה יש לשלוח תבנית WhatsApp מאושרת.
                      </div>
                    ) : null}

                    {selectedFile ? (
                      <div className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg">
                          📎
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold text-slate-700">
                            {selectedFile.name}
                          </div>

                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {formatFileSize(
                              selectedFile.size
                            )}
                            {' · '}
                            {guessMimeType(
                              selectedFile
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(
                              null
                            );

                            if (
                              fileInputRef.current
                            ) {
                              fileInputRef.current.value =
                                '';
                            }
                          }}
                          disabled={
                            isSending
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                          aria-label="הסרת קובץ"
                          title="הסרת קובץ"
                        >
                          ×
                        </button>
                      </div>
                    ) : null}

                    <div className="relative flex items-end gap-2">
                      <input
                        ref={
                          fileInputRef
                        }
                        type="file"
                        className="hidden"
                        onChange={(
                          event
                        ) =>
                          handleFileSelected(
                            event.target
                              .files?.[0] ||
                              null
                          )
                        }
                        disabled={
                          !serviceWindowOpen ||
                          isSending
                        }
                      />

                      <button
                        type="button"
                        onClick={() =>
                          fileInputRef.current
                            ?.click()
                        }
                        disabled={
                          !serviceWindowOpen ||
                          isSending
                        }
                        title="צירוף קובץ"
                        aria-label="צירוף קובץ"
                        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-white text-xl text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        📎
                      </button>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setIsEmojiPickerOpen(
                              (
                                current
                              ) =>
                                !current
                            )
                          }
                          disabled={
                            !serviceWindowOpen ||
                            isSending
                          }
                          title="אימוג׳ים"
                          aria-label="אימוג׳ים"
                          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-white text-xl shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          😊
                        </button>

                        {isEmojiPickerOpen ? (
                          <div className="absolute bottom-12 right-0 z-40 w-[286px] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
                            <div className="mb-2 text-xs font-bold text-slate-500">
                              אימוג׳ים
                            </div>

                            <div className="grid grid-cols-8 gap-1">
                              {MESSAGE_EMOJIS.map(
                                (
                                  emoji
                                ) => (
                                  <button
                                    key={
                                      emoji
                                    }
                                    type="button"
                                    onClick={() =>
                                      insertEmoji(
                                        emoji
                                      )
                                    }
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-slate-100"
                                  >
                                    {
                                      emoji
                                    }
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <textarea
                        ref={
                          textareaRef
                        }
                        value={
                          replyText
                        }
                        onChange={(
                          event
                        ) =>
                          setReplyText(
                            event
                              .target
                              .value
                          )
                        }
                        onKeyDown={(
                          event
                        ) => {
                          if (
                            event.key !==
                            'Enter'
                          ) {
                            return;
                          }

                          if (
                            event.shiftKey
                          ) {
                            return;
                          }

                          event.preventDefault();

                          if (
                            serviceWindowOpen &&
                            (
                              replyText.trim() ||
                              selectedFile
                            )
                          ) {
                            void sendReply();
                          }
                        }}
                        disabled={
                          !serviceWindowOpen ||
                          isSending
                        }
                        placeholder={
                          serviceWindowOpen
                            ? selectedFile
                              ? 'אפשר להוסיף כיתוב לקובץ...'
                              : 'כתבי תשובה ללקוח...'
                            : 'חלון השיחה הסתיים'
                        }
                        rows={1}
                        className="max-h-32 min-h-[42px] flex-1 resize-y rounded-2xl border bg-white px-4 py-2.5 text-sm leading-5 disabled:text-slate-400"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          void sendReply()
                        }
                        disabled={
                          !serviceWindowOpen ||
                          (
                            !replyText.trim() &&
                            !selectedFile
                          ) ||
                          isSending
                        }
                        className="rounded-full bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSending
                          ? 'שולח...'
                          : 'שלח'}
                      </button>
                    </div>

                    <div className="mt-2 px-1 text-[11px] text-slate-400">
                      Enter לשליחה · Shift+Enter לשורה חדשה · ניתן לצרף קובץ עד 18MB
                    </div>
                  </div>
                </div>
              )}
            </main>
          </div>
        </section>
      </div>
    </section>
  );
}