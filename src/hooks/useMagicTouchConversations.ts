'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

import {
  db,
} from '@/lib/firebase/firebase';

export type MagicTouchConversation = {
  id: string;

  agentId: string;
  contactId?: string | null;

  customerName?: string | null;
  customerPhone: string;

  phoneNumberId?: string | null;
  leadId?: string | null;

  status?: string;

  lastMessageText?: string | null;
  lastMessageType?: string | null;

  lastMessageDirection?:
    | 'inbound'
    | 'outbound';

  lastMessageAt?: unknown;
  lastInboundAt?: unknown;

  unreadCount?: number;
  needsReply?: boolean;
};

export type MagicTouchConversationMessage = {
  id: string;

  agentId?: string | null;
  contactId?: string | null;
  conversationId?: string | null;

  direction:
    | 'inbound'
    | 'outbound';

  type?: string | null;
  text?: string | null;

  templateName?: string | null;
  templateLanguage?: string | null;

  waMessageId?: string | null;
  status?: string | null;

  createdAt?: unknown;
};

type UseMagicTouchConversationsResult = {
  conversations: MagicTouchConversation[];
  filteredConversations: MagicTouchConversation[];

  selectedConversation:
    | MagicTouchConversation
    | null;

  selectedConversationId: string;
  setSelectedConversationId: (
    conversationId: string
  ) => void;

  messages: MagicTouchConversationMessage[];

  search: string;
  setSearch: (
    value: string
  ) => void;

  isLoadingConversations: boolean;
  isLoadingMessages: boolean;

  errorMessage: string;
  clearError: () => void;

  waitingForReplyCount: number;

  selectConversation: (
    conversationId: string
  ) => Promise<void>;
};

function toDate(
  value: unknown
): Date | null {
  if (!value) {
    return null;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (
      value as {
        toDate?: unknown;
      }
    ).toDate === 'function'
  ) {
    return (
      value as {
        toDate: () => Date;
      }
    ).toDate();
  }

  const parsed =
    new Date(
      value as string | number | Date
    );

  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed;
}

export function useMagicTouchConversations(
  agentId: string
): UseMagicTouchConversationsResult {
  const [
    conversations,
    setConversations,
  ] =
    useState<
      MagicTouchConversation[]
    >([]);

  const [
    selectedConversationId,
    setSelectedConversationId,
  ] =
    useState('');

  const [
    messages,
    setMessages,
  ] =
    useState<
      MagicTouchConversationMessage[]
    >([]);

  const [
    search,
    setSearch,
  ] =
    useState('');

  const [
    isLoadingConversations,
    setIsLoadingConversations,
  ] =
    useState(true);

  const [
    isLoadingMessages,
    setIsLoadingMessages,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState('');

  const clearError =
    useCallback(() => {
      setErrorMessage('');
    }, []);

  /*
   * האזנה לרשימת השיחות של הסוכן.
   */
  useEffect(() => {
    if (!agentId) {
      setConversations([]);
      setSelectedConversationId('');
      setIsLoadingConversations(false);
      return;
    }

    setIsLoadingConversations(true);
    setErrorMessage('');

    const conversationsQuery =
      query(
        collection(
          db,
          'whatsapp_conversations'
        ),
        where(
          'agentId',
          '==',
          agentId
        )
      );

    const unsubscribe =
      onSnapshot(
        conversationsQuery,
        (
          snapshot
        ) => {
          const rows =
            snapshot.docs.map(
              (
                conversationDoc
              ) => ({
                id:
                  conversationDoc.id,

                ...(
                  conversationDoc.data() as Omit<
                    MagicTouchConversation,
                    'id'
                  >
                ),
              })
            );

          rows.sort(
            (
              first,
              second
            ) => {
              const firstTime =
                toDate(
                  first.lastMessageAt
                )?.getTime() ||
                0;

              const secondTime =
                toDate(
                  second.lastMessageAt
                )?.getTime() ||
                0;

              return (
                secondTime -
                firstTime
              );
            }
          );

          setConversations(
            rows
          );

          setSelectedConversationId(
            (
              current
            ) => {
              if (
                current &&
                rows.some(
                  (
                    conversation
                  ) =>
                    conversation.id ===
                    current
                )
              ) {
                return current;
              }

              return (
                rows[0]?.id ||
                ''
              );
            }
          );

          setIsLoadingConversations(
            false
          );
        },
        (
          error
        ) => {
          console.error(
            '[useMagicTouchConversations] Failed to load conversations',
            error
          );

          setConversations([]);
          setIsLoadingConversations(
            false
          );

          setErrorMessage(
            error.message ||
              'לא ניתן היה לטעון את השיחות.'
          );
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    agentId,
  ]);

  /*
   * האזנה להודעות של השיחה שנבחרה.
   */
  useEffect(() => {
    if (
      !selectedConversationId
    ) {
      setMessages([]);
      setIsLoadingMessages(false);
      return;
    }

    setIsLoadingMessages(
      true
    );

    const messagesQuery =
      query(
        collection(
          doc(
            db,
            'whatsapp_conversations',
            selectedConversationId
          ),
          'messages'
        ),
        orderBy(
          'createdAt',
          'asc'
        )
      );

    const unsubscribe =
      onSnapshot(
        messagesQuery,
        (
          snapshot
        ) => {
          setMessages(
            snapshot.docs.map(
              (
                messageDoc
              ) => ({
                id:
                  messageDoc.id,

                ...(
                  messageDoc.data() as Omit<
                    MagicTouchConversationMessage,
                    'id'
                  >
                ),
              })
            )
          );

          setIsLoadingMessages(
            false
          );
        },
        (
          error
        ) => {
          console.error(
            '[useMagicTouchConversations] Failed to load messages',
            error
          );

          setMessages([]);
          setIsLoadingMessages(
            false
          );

          setErrorMessage(
            error.message ||
              'לא ניתן היה לטעון את ההודעות.'
          );
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    selectedConversationId,
  ]);

  const filteredConversations =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      if (!term) {
        return conversations;
      }

      return conversations.filter(
        (
          conversation
        ) => {
          const searchable =
            [
              conversation.customerName ||
                '',
              conversation.customerPhone ||
                '',
              conversation.lastMessageText ||
                '',
            ]
              .join(' ')
              .toLowerCase();

          return searchable.includes(
            term
          );
        }
      );
    }, [
      conversations,
      search,
    ]);

  const selectedConversation =
    useMemo(
      () =>
        conversations.find(
          (
            conversation
          ) =>
            conversation.id ===
            selectedConversationId
        ) ||
        null,
      [
        conversations,
        selectedConversationId,
      ]
    );

  const waitingForReplyCount =
    useMemo(
      () =>
        conversations.filter(
          (
            conversation
          ) =>
            conversation.needsReply ===
            true
        ).length,
      [
        conversations,
      ]
    );

  const markConversationRead =
    useCallback(
      async (
        conversationId: string
      ) => {
        if (!conversationId) {
          return;
        }

        try {
          await setDoc(
            doc(
              db,
              'whatsapp_conversations',
              conversationId
            ),
            {
              unreadCount:
                0,
            },
            {
              merge:
                true,
            }
          );
        } catch (
          error
        ) {
          console.error(
            '[useMagicTouchConversations] Failed to mark conversation read',
            error
          );
        }
      },
      []
    );

  const selectConversation =
    useCallback(
      async (
        conversationId: string
      ) => {
        setSelectedConversationId(
          conversationId
        );

        setErrorMessage('');

        await markConversationRead(
          conversationId
        );
      },
      [
        markConversationRead,
      ]
    );

  return {
    conversations,
    filteredConversations,

    selectedConversation,

    selectedConversationId,
    setSelectedConversationId,

    messages,

    search,
    setSearch,

    isLoadingConversations,
    isLoadingMessages,

    errorMessage,
    clearError,

    waitingForReplyCount,

    selectConversation,
  };
}

export {
  toDate as magicTouchConversationValueToDate,
};