'use client';

import {
  useState,
} from 'react';

import Link from 'next/link';

import {
  httpsCallable,
} from 'firebase/functions';

import {
  functions,
} from '@/lib/firebase/firebase';

import { useMagicTouchAgent } from '@/components/MagicTouch/MagicTouchAgentContext';

import {
  useMagicTouchConversations,
  magicTouchConversationValueToDate,
  type MagicTouchConversation,
  type MagicTouchConversationMessage,
} from '@/hooks/useMagicTouchConversations';

type SendMessageResponse = {
  ok: boolean;
  agentId: string;
  contactId: string | null;
  conversationId: string;
  waMessageId: string;
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
  eventId?: string;
  resumeStepId?: string;
};

function formatPhoneNumber(
  phone: string
): string {
  const digits =
    String(phone || '')
      .replace(/\D/g, '');

  if (!digits) {
    return '—';
  }

  let local =
    digits;

  if (
    local.startsWith('972')
  ) {
    local =
      `0${local.slice(3)}`;
  } else if (
    !local.startsWith('0')
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

  if (!date) {
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

  if (isToday) {
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

  if (!date) {
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

function getMessageText(
  message:
    MagicTouchConversationMessage
): string {
  if (message.text) {
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

  if (!inboundDate) {
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

    isLoadingConversations,
    isLoadingMessages,

    errorMessage:
      conversationsError,

    clearError:
      clearConversationsError,

    waitingForReplyCount,
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

  const errorMessage =
    sendErrorMessage ||
    conversationsError;

  const serviceWindowOpen =
    isServiceWindowOpen(
      selectedConversation
    );

  const handleSelectConversation =
    async (
      conversationId:
        string
    ) => {
      setReplyText('');
      setSendErrorMessage('');
      clearConversationsError();

      await selectConversation(
        conversationId
      );
    };

  const sendReply =
    async () => {
      const text =
        replyText.trim();

      if (
        !selectedConversationId ||
        !text ||
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

      setIsSending(true);
      setSendErrorMessage('');
      clearConversationsError();

      try {
        const fn =
          httpsCallable<
            {
              conversationId:
                string;
              text:
                string;
            },
            SendMessageResponse
          >(
            functions,
            'sendWhatsAppConversationMessage'
          );

        await fn({
          conversationId:
            selectedConversationId,
          text,
        });

        setReplyText('');
      } catch (
        error: any
      ) {
        console.error(
          '[MagicTouchConversationsPage] Failed to send message',
          error
        );

        setSendErrorMessage(
          error?.message ||
            'לא ניתן היה לשלוח את ההודעה.'
        );
      } finally {
        setIsSending(false);
      }
    };

  const resolveHumanAttention =
    async ({
      mode,
      resolvedAction,
    }: {
      mode:
        | 'handled'
        | 'continue_flow';
      resolvedAction?:
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
                'handled' |
                'continue_flow';
              resolvedAction?:
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
        });
      } catch (
        error: any
      ) {
        console.error(
          '[MagicTouchConversationsPage] Failed to resolve human attention',
          error
        );

        setSendErrorMessage(
          error?.message ||
            'לא ניתן היה לסיים את הטיפול בשיחה.'
        );
      } finally {
        setIsResolvingAttention(
          false
        );
      }
    };

  return (
    <section
      dir="rtl"
      className="w-full"
    >
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
                    אין שיחות להצגה.
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
                  selectedConversation.humanAttention
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

                      <p className="mt-1 text-sm text-red-700">
                        MagicTouch לא הצליח להתאים את תשובת הלקוח להמשך התהליך באופן בטוח.
                      </p>

                      {selectedConversation.humanAttention
                        ?.customerMessage ? (
                        <div className="mt-3 rounded-lg border border-red-100 bg-white px-3 py-2">
                          <div className="text-xs font-semibold text-slate-500">
                            הלקוח כתב
                          </div>

                          <div className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-800">
                            {
                              selectedConversation.humanAttention
                                .customerMessage
                            }
                          </div>
                        </div>
                      ) : null}

                      {selectedConversation.humanAttention
                        ?.question ? (
                        <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                          <div className="text-xs font-semibold text-amber-700">
                            התהליך עדיין ממתין לתשובה על
                          </div>

                          <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                            {
                              selectedConversation.humanAttention
                                .question
                            }
                          </div>
                        </div>
                      ) : null}

                      {selectedConversation.humanAttention
                        ?.flowName ? (
                        <div className="mt-2 text-xs text-slate-500">
                          תהליך:{' '}
                          <span className="font-semibold">
                            {
                              selectedConversation.humanAttention
                                .flowName
                            }
                          </span>
                        </div>
                      ) : null}

                      {Array.isArray(
                        selectedConversation.humanAttention
                          ?.expectedActions
                      ) &&
                      selectedConversation.humanAttention
                        ?.expectedActions
                        ?.length ? (
                        <div className="mt-4 rounded-xl border border-blue-100 bg-white p-3">
                          <div className="text-xs font-bold text-slate-700">
                            להמשיך את ה־Flow לפי החלטתך
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedConversation.humanAttention
                              .expectedActions
                              .map(
                                (
                                  action
                                ) => {
                                  const option =
                                    selectedConversation.humanAttention
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
                                      {label}
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
                          "טופל" מסיר את ההתראה בלבד ואינו ממשיך את ה־Flow.
                        </span>
                      </div>
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
                                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                                  isOutbound
                                    ? 'rounded-br-sm bg-[#dcf8c6]'
                                    : 'rounded-bl-sm bg-white'
                                }`}
                              >
                                <div className="whitespace-pre-wrap">
                                  {getMessageText(
                                    message
                                  )}
                                </div>

                                <div className="mt-1 text-left text-[10px] text-slate-500">
                                  {formatMessageTime(
                                    message.createdAt
                                  )}

                                  {isOutbound &&
                                  message.status
                                    ? ` · ${message.status}`
                                    : ''}
                                </div>
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

                    <div className="flex gap-2">
                      <input
                        type="text"
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
                            event.key ===
                            'Enter'
                          ) {
                            event.preventDefault();

                            if (
                              serviceWindowOpen
                            ) {
                              void sendReply();
                            }
                          }
                        }}
                        disabled={
                          !serviceWindowOpen ||
                          isSending
                        }
                        placeholder={
                          serviceWindowOpen
                            ? 'כתבי תשובה ללקוח...'
                            : 'חלון השיחה הסתיים'
                        }
                        className="flex-1 rounded-full border bg-white px-4 py-2 text-sm disabled:text-slate-400"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          void sendReply()
                        }
                        disabled={
                          !serviceWindowOpen ||
                          !replyText.trim() ||
                          isSending
                        }
                        className="rounded-full bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSending
                          ? 'שולח...'
                          : 'שלח'}
                      </button>
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