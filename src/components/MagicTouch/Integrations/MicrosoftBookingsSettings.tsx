"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useSearchParams,
} from "next/navigation";

import {
  doc,
  onSnapshot,
} from "firebase/firestore";

import {
  httpsCallable,
} from "firebase/functions";

import {
  db,
  functions,
} from "@/lib/firebase/firebase";

import {
  useAuth,
} from "@/lib/firebase/AuthContext";

import {
  useMagicTouchAgent,
} from "@/components/MagicTouch/MagicTouchAgentContext";

import {
  usePermission,
} from "@/hooks/usePermission";

import {
  Button,
} from "@/components/Button/Button";

import DialogNotification from "@/components/DialogNotification";
import AccessDenied from "@/components/AccessDenied";

type DialogKind =
  | "info"
  | "warning"
  | "success"
  | "error";

type DialogState = {
  type: DialogKind;
  title: string;
  message: string;
};

type MicrosoftBusiness = {
  id: string;
  displayName: string;
};

type MicrosoftBookingService = {
  id: string;
  displayName: string;
  description?: string | null;
  defaultDuration?: string | null;
  webUrl?: string | null;
  isHiddenFromCustomers?: boolean;
};

type BookingDayKey =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

type MicrosoftBookingWorkTimeSlot = {
  startTime: string;
  endTime: string;
};

type MicrosoftBookingWorkHours = {
  day: BookingDayKey;
  timeSlots: MicrosoftBookingWorkTimeSlot[];
};

type MicrosoftBookingStaffMember = {
  id: string;
  displayName: string;

  emailAddress?: string | null;
  role?: string | null;
  membershipStatus?: string | null;

  timeZone?: string | null;

  useBusinessHours?: boolean;

  availabilityIsAffectedByPersonalCalendar?: boolean;

  workingHours?: MicrosoftBookingWorkHours[];
};

type AvailabilityDay = {
  day: BookingDayKey;
  label: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

type TimestampLike = {
  toDate?: () => Date;
};

type MicrosoftBookingsConfig = {
  status?: string;
  connected?: boolean;

  microsoftUserName?: string | null;
  microsoftUserEmail?: string | null;

  bookingBusinessId?: string | null;
  bookingBusinessName?: string | null;
  bookingBusinessEmail?: string | null;
  bookingBusinessPhone?: string | null;
  bookingBusinessPublicUrl?: string | null;

  availableBusinesses?: MicrosoftBusiness[];
  availableServices?: MicrosoftBookingService[];

  availableStaffMembers?: MicrosoftBookingStaffMember[];

  selectedBookingStaffMemberId?: string | null;
  selectedBookingStaffMemberName?: string | null;
  selectedBookingStaffMemberEmail?: string | null;

  bookingStaffTimeZone?: string | null;

  bookingStaffWorkingHours?: MicrosoftBookingWorkHours[];

  defaultBookingServiceId?: string | null;
  defaultBookingServiceName?: string | null;
  defaultBookingServiceUrl?: string | null;
  defaultBookingServiceDurationMinutes?: number | null;

  defaultBookingServicePreBufferMinutes?: number | null;
  defaultBookingServicePostBufferMinutes?: number | null;
  defaultBookingServiceMinimumLeadTimeMinutes?: number | null;
  defaultBookingServiceMaximumAdvanceDays?: number | null;
  defaultBookingServiceTimeSlotIntervalMinutes?: number | null;

  defaultBookingServiceStaffMemberId?: string | null;

  lastSyncAt?: TimestampLike | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;

  lastSyncAppointmentCount?: number | null;
  lastSyncMatchedCount?: number | null;
  lastSyncUnmatchedCount?: number | null;
  lastSyncCancelledCount?: number | null;
  lastSyncCreatedEventCount?: number | null;
  lastSyncCancelledEventCount?: number | null;
};

type ListServicesResult = {
  ok: boolean;
  bookingBusinessId: string;
  count: number;
  services: MicrosoftBookingService[];
  defaultServiceId?: string | null;
};

type ListStaffResult = {
  ok: boolean;

  bookingBusinessId: string;

  count: number;

  staffMembers:
    MicrosoftBookingStaffMember[];

  selectedStaffMemberId?:
    string |
    null;
};

type CreateServiceResult = {
  ok: boolean;
  created: boolean;
  selectedAsDefault: boolean;

  service: {
    id: string;
    displayName: string;
    description?: string | null;
    defaultDuration?: string | null;
    durationMinutes?: number;
    webUrl?: string | null;

    staffMemberId?: string | null;

    preBufferMinutes?: number;
    postBufferMinutes?: number;

    minimumLeadTimeMinutes?: number;
    maximumAdvanceDays?: number;
    timeSlotIntervalMinutes?: number;
  };
};

type ServiceMode =
  | "existing"
  | "create";

const CONNECTION_STATUS_LABELS:
Record<string, string> = {
  connected:
    "מחובר",

  needs_business_selection:
    "נדרשת בחירת עסק",

  no_booking_business:
    "לא נמצא עסק Bookings",

  disconnected:
    "לא מחובר",
};

const SYNC_STATUS_LABELS:
Record<string, string> = {
  not_started:
    "טרם בוצע סנכרון",

  success:
    "הסנכרון הצליח",

  failed:
    "הסנכרון נכשל",
};

const DEFAULT_AVAILABILITY:
AvailabilityDay[] = [
  {
    day:
      "sunday",

    label:
      "יום א׳",

    enabled:
      true,

    startTime:
      "09:00",

    endTime:
      "17:00",
  },

  {
    day:
      "monday",

    label:
      "יום ב׳",

    enabled:
      true,

    startTime:
      "09:00",

    endTime:
      "17:00",
  },

  {
    day:
      "tuesday",

    label:
      "יום ג׳",

    enabled:
      true,

    startTime:
      "09:00",

    endTime:
      "17:00",
  },

  {
    day:
      "wednesday",

    label:
      "יום ד׳",

    enabled:
      true,

    startTime:
      "09:00",

    endTime:
      "17:00",
  },

  {
    day:
      "thursday",

    label:
      "יום ה׳",

    enabled:
      true,

    startTime:
      "09:00",

    endTime:
      "17:00",
  },

  {
    day:
      "friday",

    label:
      "יום ו׳",

    enabled:
      false,

    startTime:
      "09:00",

    endTime:
      "13:00",
  },

  {
    day:
      "saturday",

    label:
      "שבת",

    enabled:
      false,

    startTime:
      "09:00",

    endTime:
      "17:00",
  },
];

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function formatTimestamp(
  value?:
    TimestampLike |
    null
): string {
  if (
    !value ||
    typeof value.toDate !==
      "function"
  ) {
    return "-";
  }

  return value
    .toDate()
    .toLocaleString(
      "he-IL"
    );
}

function durationText(
  value?:
    string |
    null
): string {
  const raw =
    s(
      value
    );

  if (!raw) {
    return "-";
  }

  const match =
    raw.match(
      /^PT(?:(\d+)H)?(?:(\d+)M)?$/
    );

  if (!match) {
    return raw;
  }

  const hours =
    Number(
      match[1] ||
      0
    );

  const minutes =
    Number(
      match[2] ||
      0
    );

  const total =
    hours *
      60 +
    minutes;

  return total > 0
    ? `${total} דקות`
    : raw;
}

function normalizeGraphTime(
  value: unknown,
  fallback: string
): string {
  const raw =
    s(
      value
    );

  const match =
    raw.match(
      /^(\d{2}):(\d{2})/
    );

  if (!match) {
    return fallback;
  }

  return `${match[1]}:${match[2]}`;
}

function availabilityFromWorkingHours(
  workingHours?:
    MicrosoftBookingWorkHours[]
): AvailabilityDay[] {
  if (
    !Array.isArray(
      workingHours
    )
  ) {
    return DEFAULT_AVAILABILITY.map(
      (
        item
      ) => ({
        ...item,
      })
    );
  }

  return DEFAULT_AVAILABILITY.map(
    (
      defaultDay
    ) => {
      const graphDay =
        workingHours.find(
          (
            item
          ) =>
            item.day ===
            defaultDay.day
        );

      const firstSlot =
        Array.isArray(
          graphDay?.timeSlots
        )
          ? graphDay
              ?.timeSlots[0]
          : null;

      if (
        !firstSlot
      ) {
        return {
          ...defaultDay,

          enabled:
            false,
        };
      }

      return {
        ...defaultDay,

        enabled:
          true,

        startTime:
          normalizeGraphTime(
            firstSlot.startTime,
            defaultDay.startTime
          ),

        endTime:
          normalizeGraphTime(
            firstSlot.endTime,
            defaultDay.endTime
          ),
      };
    }
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <div className="text-xs font-semibold text-gray-500">
        {label}
      </div>

      <div className="mt-1 break-words text-sm font-medium">
        {value}
      </div>
    </div>
  );
}

export default function MicrosoftBookingsSettings() {
  const {
    effectiveAgentId,
  } =
    useMagicTouchAgent();

  const searchParams =
    useSearchParams();

  const {
    user,
    isLoading,
  } =
    useAuth() as any;

  const {
    canAccess,
    isChecking,
  } =
    usePermission(
      user
        ? "access_magic_touch"
        : null
    );

  const agentId =
    effectiveAgentId;

  const [
    config,
    setConfig,
  ] =
    useState<MicrosoftBookingsConfig | null>(
      null
    );

  const [
    loadingConfig,
    setLoadingConfig,
  ] =
    useState(true);

  const [
    connecting,
    setConnecting,
  ] =
    useState(false);

  const [
    disconnecting,
    setDisconnecting,
  ] =
    useState(false);

  const [
    savingBusiness,
    setSavingBusiness,
  ] =
    useState(false);

  const [
    testingConnection,
    setTestingConnection,
  ] =
    useState(false);

  const [
    selectedBusinessId,
    setSelectedBusinessId,
  ] =
    useState("");

  const [
    dialog,
    setDialog,
  ] =
    useState<DialogState | null>(
      null
    );

  /*
   * Services
   */

  const [
    services,
    setServices,
  ] =
    useState<MicrosoftBookingService[]>(
      []
    );

  const [
    loadingServices,
    setLoadingServices,
  ] =
    useState(false);

  const [
    serviceMode,
    setServiceMode,
  ] =
    useState<ServiceMode>(
      "existing"
    );

  const [
    selectedServiceId,
    setSelectedServiceId,
  ] =
    useState("");

  const [
    savingDefaultService,
    setSavingDefaultService,
  ] =
    useState(false);

  const [
    creatingService,
    setCreatingService,
  ] =
    useState(false);

  /*
   * Staff
   */

  const [
    staffMembers,
    setStaffMembers,
  ] =
    useState<MicrosoftBookingStaffMember[]>(
      []
    );

  const [
    loadingStaff,
    setLoadingStaff,
  ] =
    useState(false);

  const [
    selectedStaffMemberId,
    setSelectedStaffMemberId,
  ] =
    useState("");

  const [
    savingAvailability,
    setSavingAvailability,
  ] =
    useState(false);

  const [
    availability,
    setAvailability,
  ] =
    useState<AvailabilityDay[]>(
      DEFAULT_AVAILABILITY
    );

  /*
   * New service
   */

  const [
    newServiceName,
    setNewServiceName,
  ] =
    useState(
      "פגישת ייעוץ"
    );

  const [
    newServiceDescription,
    setNewServiceDescription,
  ] =
    useState(
      "פגישת ייעוץ עם הסוכן"
    );

  const [
    newServiceDurationMinutes,
    setNewServiceDurationMinutes,
  ] =
    useState(
      30
    );

  const [
    preBufferMinutes,
    setPreBufferMinutes,
  ] =
    useState(
      0
    );

  const [
    postBufferMinutes,
    setPostBufferMinutes,
  ] =
    useState(
      0
    );

  const [
    minimumLeadTimeMinutes,
    setMinimumLeadTimeMinutes,
  ] =
    useState(
      120
    );

  const [
    maximumAdvanceDays,
    setMaximumAdvanceDays,
  ] =
    useState(
      60
    );

  const [
    timeSlotIntervalMinutes,
    setTimeSlotIntervalMinutes,
  ] =
    useState(
      30
    );

  /*
   * Config listener
   */

  useEffect(
    () => {
      if (
        !agentId
      ) {
        setConfig(
          null
        );

        setLoadingConfig(
          false
        );

        return;
      }

      setLoadingConfig(
        true
      );

      const configRef =
        doc(
          db,
          `agents/${agentId}/config/microsoftBookings`
        );

      return onSnapshot(
        configRef,

        (
          snapshot
        ) => {
          if (
            !snapshot.exists()
          ) {
            setConfig(
              null
            );

            setSelectedBusinessId(
              ""
            );

            setServices(
              []
            );

            setStaffMembers(
              []
            );

            setSelectedServiceId(
              ""
            );

            setSelectedStaffMemberId(
              ""
            );

            setLoadingConfig(
              false
            );

            return;
          }

          const data =
            snapshot.data();

          const availableBusinesses =
            Array.isArray(
              data.availableBusinesses
            )
              ? data.availableBusinesses.map(
                  (
                    business:
                      Record<string, unknown>
                  ) => ({
                    id:
                      s(
                        business.id
                      ),

                    displayName:
                      s(
                        business.displayName ||
                        business.id
                      ),
                  })
                )
              : [];

          const availableServices =
            Array.isArray(
              data.availableServices
            )
              ? data.availableServices.map(
                  (
                    service:
                      Record<string, unknown>
                  ) => ({
                    id:
                      s(
                        service.id
                      ),

                    displayName:
                      s(
                        service.displayName ||
                        service.id
                      ),

                    description:
                      s(
                        service.description
                      ) ||
                      null,

                    defaultDuration:
                      s(
                        service.defaultDuration
                      ) ||
                      null,

                    webUrl:
                      s(
                        service.webUrl
                      ) ||
                      null,

                    isHiddenFromCustomers:
                      service.isHiddenFromCustomers ===
                      true,
                  })
                )
              : [];

          const availableStaffMembers =
            Array.isArray(
              data.availableStaffMembers
            )
              ? data.availableStaffMembers.map(
                  (
                    member:
                      Record<string, any>
                  ) => ({
                    id:
                      s(
                        member.id
                      ),

                    displayName:
                      s(
                        member.displayName ||
                        member.emailAddress ||
                        member.id
                      ),

                    emailAddress:
                      s(
                        member.emailAddress
                      ) ||
                      null,

                    role:
                      s(
                        member.role
                      ) ||
                      null,

                    membershipStatus:
                      s(
                        member.membershipStatus
                      ) ||
                      null,

                    timeZone:
                      s(
                        member.timeZone
                      ) ||
                      null,

                    useBusinessHours:
                      member.useBusinessHours !==
                      false,

                    availabilityIsAffectedByPersonalCalendar:
                      member.availabilityIsAffectedByPersonalCalendar ===
                      true,

                    workingHours:
                      Array.isArray(
                        member.workingHours
                      )
                        ? member.workingHours
                        : [],
                  })
                )
              : [];

          const nextConfig:
          MicrosoftBookingsConfig = {
            status:
              s(
                data.status
              ),

            connected:
              data.connected ===
              true,

            microsoftUserName:
              data.microsoftUserName ||
              null,

            microsoftUserEmail:
              data.microsoftUserEmail ||
              null,

            bookingBusinessId:
              data.bookingBusinessId ||
              null,

            bookingBusinessName:
              data.bookingBusinessName ||
              null,

            bookingBusinessEmail:
              data.bookingBusinessEmail ||
              null,

            bookingBusinessPhone:
              data.bookingBusinessPhone ||
              null,

            bookingBusinessPublicUrl:
              data.bookingBusinessPublicUrl ||
              null,

            availableBusinesses,

            availableServices,

            availableStaffMembers,

            selectedBookingStaffMemberId:
              data.selectedBookingStaffMemberId ||
              null,

            selectedBookingStaffMemberName:
              data.selectedBookingStaffMemberName ||
              null,

            selectedBookingStaffMemberEmail:
              data.selectedBookingStaffMemberEmail ||
              null,

            bookingStaffTimeZone:
              data.bookingStaffTimeZone ||
              null,

            bookingStaffWorkingHours:
              Array.isArray(
                data.bookingStaffWorkingHours
              )
                ? data.bookingStaffWorkingHours
                : [],

            defaultBookingServiceId:
              data.defaultBookingServiceId ||
              null,

            defaultBookingServiceName:
              data.defaultBookingServiceName ||
              null,

            defaultBookingServiceUrl:
              data.defaultBookingServiceUrl ||
              null,

            defaultBookingServiceDurationMinutes:
              typeof data.defaultBookingServiceDurationMinutes ===
              "number"
                ? data.defaultBookingServiceDurationMinutes
                : null,

            defaultBookingServicePreBufferMinutes:
              typeof data.defaultBookingServicePreBufferMinutes ===
              "number"
                ? data.defaultBookingServicePreBufferMinutes
                : null,

            defaultBookingServicePostBufferMinutes:
              typeof data.defaultBookingServicePostBufferMinutes ===
              "number"
                ? data.defaultBookingServicePostBufferMinutes
                : null,

            defaultBookingServiceMinimumLeadTimeMinutes:
              typeof data.defaultBookingServiceMinimumLeadTimeMinutes ===
              "number"
                ? data.defaultBookingServiceMinimumLeadTimeMinutes
                : null,

            defaultBookingServiceMaximumAdvanceDays:
              typeof data.defaultBookingServiceMaximumAdvanceDays ===
              "number"
                ? data.defaultBookingServiceMaximumAdvanceDays
                : null,

            defaultBookingServiceTimeSlotIntervalMinutes:
              typeof data.defaultBookingServiceTimeSlotIntervalMinutes ===
              "number"
                ? data.defaultBookingServiceTimeSlotIntervalMinutes
                : null,

            defaultBookingServiceStaffMemberId:
              data.defaultBookingServiceStaffMemberId ||
              null,

            lastSyncAt:
              data.lastSyncAt ||
              null,

            lastSyncStatus:
              data.lastSyncStatus ||
              null,

            lastSyncError:
              data.lastSyncError ||
              null,

            lastSyncAppointmentCount:
              typeof data.lastSyncAppointmentCount ===
              "number"
                ? data.lastSyncAppointmentCount
                : null,

            lastSyncMatchedCount:
              typeof data.lastSyncMatchedCount ===
              "number"
                ? data.lastSyncMatchedCount
                : null,

            lastSyncUnmatchedCount:
              typeof data.lastSyncUnmatchedCount ===
              "number"
                ? data.lastSyncUnmatchedCount
                : null,

            lastSyncCancelledCount:
              typeof data.lastSyncCancelledCount ===
              "number"
                ? data.lastSyncCancelledCount
                : null,

            lastSyncCreatedEventCount:
              typeof data.lastSyncCreatedEventCount ===
              "number"
                ? data.lastSyncCreatedEventCount
                : null,

            lastSyncCancelledEventCount:
              typeof data.lastSyncCancelledEventCount ===
              "number"
                ? data.lastSyncCancelledEventCount
                : null,
          };

          setConfig(
            nextConfig
          );

          setServices(
            availableServices
          );

          setStaffMembers(
            availableStaffMembers
          );

          setSelectedBusinessId(
            s(
              data.bookingBusinessId ||
              availableBusinesses[0]?.id
            )
          );

          setSelectedServiceId(
            s(
              data.defaultBookingServiceId
            )
          );

          const configuredStaffId =
            s(
              data.selectedBookingStaffMemberId
            );

          if (
            configuredStaffId
          ) {
            setSelectedStaffMemberId(
              configuredStaffId
            );

            if (
              Array.isArray(
                data.bookingStaffWorkingHours
              ) &&
              data.bookingStaffWorkingHours.length >
                0
            ) {
              setAvailability(
                availabilityFromWorkingHours(
                  data.bookingStaffWorkingHours
                )
              );
            }
          }

          setLoadingConfig(
            false
          );
        },

        (
          error
        ) => {
          console.error(
            "[MicrosoftBookingsSettings] config listener failed",
            error
          );

          setLoadingConfig(
            false
          );

          setDialog({
            type:
              "error",

            title:
              "שגיאה",

            message:
              "לא ניתן לטעון את הגדרות Microsoft Bookings.",
          });
        }
      );
    },

    [
      agentId,
    ]
  );

  /*
   * OAuth result
   */

  useEffect(
    () => {
      const result =
        searchParams.get(
          "microsoftBookings"
        );

      if (
        !result
      ) {
        return;
      }

      if (
        result ===
        "connected"
      ) {
        setDialog({
          type:
            "success",

          title:
            "החיבור הושלם",

          message:
            "חשבון Microsoft Bookings חובר בהצלחה.",
        });

        return;
      }

      if (
        result ===
        "needs_business_selection"
      ) {
        setDialog({
          type:
            "warning",

          title:
            "נדרשת בחירת עסק",

          message:
            "החשבון חובר. כעת יש לבחור את עסק ה-Bookings.",
        });

        return;
      }

      if (
        result ===
        "no_booking_business"
      ) {
        setDialog({
          type:
            "warning",

          title:
            "לא נמצא Bookings",

          message:
            "החשבון חובר, אך לא נמצא עסק Microsoft Bookings פעיל.",
        });

        return;
      }

      if (
        result ===
        "error"
      ) {
        setDialog({
          type:
            "error",

          title:
            "החיבור נכשל",

          message:
            searchParams.get(
              "message"
            ) ||
            "החיבור ל-Microsoft נכשל.",
        });
      }
    },

    [
      searchParams,
    ]
  );

  const connectionStatus =
    useMemo(
      () => {
        if (
          !config
        ) {
          return "disconnected";
        }

        return (
          config.status ||
          (
            config.connected
              ? "connected"
              : "disconnected"
          )
        );
      },

      [
        config,
      ]
    );

  const statusLabel =
    CONNECTION_STATUS_LABELS[
      connectionStatus
    ] ||
    connectionStatus ||
    "לא מחובר";

  const syncStatusLabel =
    SYNC_STATUS_LABELS[
      s(
        config?.lastSyncStatus ||
        "not_started"
      )
    ] ||
    config?.lastSyncStatus ||
    "טרם בוצע סנכרון";

  const statusClasses =
    connectionStatus ===
    "connected"
      ? "bg-green-100 text-green-800"
      : connectionStatus ===
        "needs_business_selection"
        ? "bg-yellow-100 text-yellow-800"
        : connectionStatus ===
          "no_booking_business"
          ? "bg-orange-100 text-orange-800"
          : "bg-gray-100 text-gray-700";

  const defaultService =
    useMemo(
      () => {
        const id =
          s(
            config?.defaultBookingServiceId
          );

        if (!id) {
          return null;
        }

        return (
          services.find(
            (
              service
            ) =>
              service.id ===
              id
          ) ||
          {
            id,

            displayName:
              s(
                config?.defaultBookingServiceName
              ) ||
              "פגישה שנבחרה",

            webUrl:
              s(
                config?.defaultBookingServiceUrl
              ) ||
              null,

            defaultDuration:
              null,

            description:
              null,

            isHiddenFromCustomers:
              false,
          }
        );
      },

      [
        config,
        services,
      ]
    );

  const selectedStaffMember =
    useMemo(
      () =>
        staffMembers.find(
          (
            member
          ) =>
            member.id ===
            selectedStaffMemberId
        ) ||
        null,
      [
        staffMembers,
        selectedStaffMemberId,
      ]
    );

  /*
   * Load services
   */

  const loadServices =
    useCallback(
      async (
        showSuccess:
          boolean =
          false
      ) => {
        if (
          !config?.connected ||
          !config?.bookingBusinessId
        ) {
          return;
        }

        setLoadingServices(
          true
        );

        try {
          const fn =
            httpsCallable<
              Record<string, never>,
              ListServicesResult
            >(
              functions,
              "listMicrosoftBookingServices"
            );

          const response =
            await fn({});

          const nextServices =
            Array.isArray(
              response.data
                ?.services
            )
              ? response.data
                  .services
              : [];

          setServices(
            nextServices
          );

          const defaultId =
            s(
              response.data
                ?.defaultServiceId ||
              config.defaultBookingServiceId
            );

          if (
            defaultId
          ) {
            setSelectedServiceId(
              defaultId
            );
          } else if (
            nextServices.length ===
            1
          ) {
            setSelectedServiceId(
              nextServices[0].id
            );
          }

          if (
            nextServices.length ===
            0
          ) {
            setServiceMode(
              "create"
            );
          }

          if (
            showSuccess
          ) {
            setDialog({
              type:
                "success",

              title:
                "סוגי הפגישות נטענו",

              message:
                `נמצאו ${nextServices.length} סוגי פגישות ב-Microsoft Bookings.`,
            });
          }
        } catch (
          error: any
        ) {
          console.error(
            "[MicrosoftBookingsSettings] load services failed",
            error
          );

          setDialog({
            type:
              "error",

            title:
              "טעינת סוגי הפגישות נכשלה",

            message:
              error?.message ||
              "לא ניתן לטעון את סוגי הפגישות מ-Microsoft Bookings.",
          });
        } finally {
          setLoadingServices(
            false
          );
        }
      },

      [
        config?.connected,
        config?.bookingBusinessId,
        config?.defaultBookingServiceId,
      ]
    );

  /*
   * Load staff
   */

  const loadStaff =
    useCallback(
      async (
        showSuccess:
          boolean =
          false
      ) => {
        if (
          !config?.connected ||
          !config?.bookingBusinessId
        ) {
          return;
        }

        setLoadingStaff(
          true
        );

        try {
          const fn =
            httpsCallable<
              Record<string, never>,
              ListStaffResult
            >(
              functions,
              "listMicrosoftBookingStaffMembers"
            );

          const response =
            await fn({});

          const nextStaff =
            Array.isArray(
              response.data
                ?.staffMembers
            )
              ? response.data
                  .staffMembers
              : [];

          setStaffMembers(
            nextStaff
          );

          const configuredId =
            s(
              response.data
                ?.selectedStaffMemberId ||
              config.selectedBookingStaffMemberId
            );

          let nextSelectedId =
            configuredId;

          if (
            !nextSelectedId &&
            nextStaff.length ===
            1
          ) {
            nextSelectedId =
              nextStaff[0].id;
          }

          if (
            nextSelectedId
          ) {
            setSelectedStaffMemberId(
              nextSelectedId
            );

            const member =
              nextStaff.find(
                (
                  item
                ) =>
                  item.id ===
                  nextSelectedId
              );

            if (
              member?.workingHours &&
              member.workingHours.length >
                0
            ) {
              setAvailability(
                availabilityFromWorkingHours(
                  member.workingHours
                )
              );
            }
          }

          if (
            showSuccess
          ) {
            setDialog({
              type:
                "success",

              title:
                "אנשי הצוות נטענו",

              message:
                `נמצאו ${nextStaff.length} אנשי צוות ב-Microsoft Bookings.`,
            });
          }
        } catch (
          error: any
        ) {
          console.error(
            "[MicrosoftBookingsSettings] load staff failed",
            error
          );

          setDialog({
            type:
              "error",

            title:
              "טעינת אנשי הצוות נכשלה",

            message:
              error?.message ||
              "לא ניתן לטעון את אנשי הצוות מ-Microsoft Bookings.",
          });
        } finally {
          setLoadingStaff(
            false
          );
        }
      },

      [
        config?.connected,
        config?.bookingBusinessId,
        config?.selectedBookingStaffMemberId,
      ]
    );

  useEffect(
    () => {
      if (
        config?.connected &&
        config?.bookingBusinessId
      ) {
        void loadServices(
          false
        );

        void loadStaff(
          false
        );
      }
    },

    [
      config?.connected,
      config?.bookingBusinessId,
      loadServices,
      loadStaff,
    ]
  );

  const handleConnectMicrosoft =
    async () => {
      setConnecting(
        true
      );

      try {
        const fn =
          httpsCallable(
            functions,
            "startMicrosoftBookingsAuth"
          );

        const result =
          await fn({});

        const data =
          result.data as {
            authUrl?: string;
          };

        const authUrl =
          s(
            data?.authUrl
          );

        if (
          !authUrl
        ) {
          throw new Error(
            "לא התקבלה כתובת התחברות ל-Microsoft."
          );
        }

        window.location.assign(
          authUrl
        );
      } catch (
        error: any
      ) {
        setConnecting(
          false
        );

        setDialog({
          type:
            "error",

          title:
            "החיבור נכשל",

          message:
            error?.message ||
            "לא ניתן להתחיל את החיבור ל-Microsoft.",
        });
      }
    };

  const handleSelectBusiness =
    async () => {
      if (
        !selectedBusinessId
      ) {
        setDialog({
          type:
            "warning",

          title:
            "לא נבחר עסק",

          message:
            "יש לבחור עסק Microsoft Bookings.",
        });

        return;
      }

      setSavingBusiness(
        true
      );

      try {
        const fn =
          httpsCallable(
            functions,
            "selectMicrosoftBookingsBusiness"
          );

        const result =
          await fn({
            businessId:
              selectedBusinessId,
          });

        const data =
          result.data as {
            bookingBusinessName?:
              string |
              null;
          };

        setDialog({
          type:
            "success",

          title:
            "העסק נשמר",

          message:
            `עסק ה-Bookings${
              data.bookingBusinessName
                ? ` ${data.bookingBusinessName}`
                : ""
            } נבחר בהצלחה.`,
        });
      } catch (
        error: any
      ) {
        setDialog({
          type:
            "error",

          title:
            "שמירת העסק נכשלה",

          message:
            error?.message ||
            "לא ניתן לשמור את עסק ה-Bookings.",
        });
      } finally {
        setSavingBusiness(
          false
        );
      }
    };

  /*
   * Staff selection
   */

  const handleStaffSelection =
    (
      staffMemberId:
        string
    ) => {
      setSelectedStaffMemberId(
        staffMemberId
      );

      const member =
        staffMembers.find(
          (
            item
          ) =>
            item.id ===
            staffMemberId
        );

      if (
        member?.workingHours &&
        member.workingHours.length >
          0
      ) {
        setAvailability(
          availabilityFromWorkingHours(
            member.workingHours
          )
        );
      } else {
        setAvailability(
          DEFAULT_AVAILABILITY.map(
            (
              item
            ) => ({
              ...item,
            })
          )
        );
      }
    };


const handleCopyBookingLink =
  async () => {
    const url =
      s(
        defaultService?.webUrl ||
        config?.defaultBookingServiceUrl
      );

    if (!url) {
      setDialog({
        type:
          "warning",

        title:
          "אין קישור זמין",

        message:
          "לא נמצא קישור לפגישת ברירת המחדל.",
      });

      return;
    }

    try {
      await navigator.clipboard.writeText(
        url
      );

      setDialog({
        type:
          "success",

        title:
          "הקישור הועתק",

        message:
          "קישור הפגישה הועתק ללוח ואפשר להדביק אותו בהודעה.",
      });
    } catch (
      error
    ) {
      console.error(
        "[MicrosoftBookingsSettings] copy booking link failed",
        error
      );

      setDialog({
        type:
          "error",

        title:
          "העתקת הקישור נכשלה",

        message:
          "לא ניתן להעתיק את קישור הפגישה.",
      });
    }
  };


  const updateAvailabilityDay =
    (
      day:
        BookingDayKey,

      patch:
        Partial<
          AvailabilityDay
        >
    ) => {
      setAvailability(
        (
          current
        ) =>
          current.map(
            (
              item
            ) =>
              item.day ===
              day
                ? {
                    ...item,
                    ...patch,
                  }
                : item
          )
      );
    };

  const handleSaveAvailability =
    async () => {
      if (
        !selectedStaffMemberId
      ) {
        setDialog({
          type:
            "warning",

          title:
            "לא נבחר איש צוות",

          message:
            "יש לבחור מי מקבל את הפגישות לפני שמירת הזמינות.",
        });

        return;
      }

      const invalidDay =
        availability.find(
          (
            item
          ) =>
            item.enabled &&
            item.startTime >=
              item.endTime
        );

      if (
        invalidDay
      ) {
        setDialog({
          type:
            "warning",

          title:
            "טווח שעות לא תקין",

          message:
            `ביום ${invalidDay.label} שעת הסיום חייבת להיות מאוחרת משעת ההתחלה.`,
        });

        return;
      }

      setSavingAvailability(
        true
      );

      try {
        const fn =
          httpsCallable<
            {
              staffMemberId:
                string;

              timeZone:
                string;

              workingHours:
                Array<{
                  day:
                    BookingDayKey;

                  enabled:
                    boolean;

                  startTime:
                    string;

                  endTime:
                    string;
                }>;
            },
            {
              ok:
                boolean;
            }
          >(
            functions,
            "updateMicrosoftBookingStaffAvailability"
          );

        await fn({
          staffMemberId:
            selectedStaffMemberId,

          timeZone:
            "Israel Standard Time",

          workingHours:
            availability.map(
              (
                item
              ) => ({
                day:
                  item.day,

                enabled:
                  item.enabled,

                startTime:
                  item.startTime,

                endTime:
                  item.endTime,
              })
            ),
        });

        setDialog({
          type:
            "success",

          title:
            "הזמינות נשמרה",

          message:
            "ימי ושעות הפגישה נשמרו ב-Microsoft Bookings. זמנים תפוסים ביומן Microsoft ימשיכו להיחסם.",
        });

        await loadStaff(
          false
        );
      } catch (
        error: any
      ) {
        console.error(
          "[MicrosoftBookingsSettings] save availability failed",
          error
        );

        setDialog({
          type:
            "error",

          title:
            "שמירת הזמינות נכשלה",

          message:
            error?.message ||
            "לא ניתן לשמור את הזמינות ב-Microsoft Bookings.",
        });
      } finally {
        setSavingAvailability(
          false
        );
      }
    };

  /*
   * Existing service
   */

  const handleSelectExistingService =
    async () => {
      if (
        !selectedServiceId
      ) {
        setDialog({
          type:
            "warning",

          title:
            "לא נבחרה פגישה",

          message:
            "יש לבחור סוג פגישה מתוך Microsoft Bookings.",
        });

        return;
      }

      setSavingDefaultService(
        true
      );

      try {
        const fn =
          httpsCallable<
            {
              serviceId:
                string;
            },
            {
              ok:
                boolean;

              service?: {
                id?: string;
                displayName?: string | null;
                webUrl?: string | null;
              };
            }
          >(
            functions,
            "selectDefaultMicrosoftBookingService"
          );

        const response =
          await fn({
            serviceId:
              selectedServiceId,
          });

        setDialog({
          type:
            "success",

          title:
            "הפגישה נשמרה",

          message:
            `${
              response.data
                ?.service
                ?.displayName ||
              "הפגישה"
            } הוגדרה כפגישת ברירת המחדל של MagicTouch.`,
        });
      } catch (
        error: any
      ) {
        console.error(
          "[MicrosoftBookingsSettings] select default service failed",
          error
        );

        setDialog({
          type:
            "error",

          title:
            "שמירת הפגישה נכשלה",

          message:
            error?.message ||
            "לא ניתן לשמור את סוג הפגישה שנבחר.",
        });
      } finally {
        setSavingDefaultService(
          false
        );
      }
    };

  /*
   * Create service
   */

  const handleCreateService =
    async () => {
      const displayName =
        newServiceName.trim();

      if (
        !displayName
      ) {
        setDialog({
          type:
            "warning",

          title:
            "חסר שם לפגישה",

          message:
            "יש להזין שם לסוג הפגישה החדש.",
        });

        return;
      }

      if (
        !selectedStaffMemberId
      ) {
        setDialog({
          type:
            "warning",

          title:
            "לא נבחר מי מקבל את הפגישה",

          message:
            "יש לבחור איש צוות לפני יצירת סוג הפגישה החדש.",
        });

        return;
      }

      const durationMinutes =
        Math.max(
          5,
          Math.min(
            480,
            Number(
              newServiceDurationMinutes
            ) ||
            30
          )
        );

      setCreatingService(
        true
      );

      try {
        const fn =
          httpsCallable<
            {
              displayName:
                string;

              description:
                string;

              durationMinutes:
                number;

              preBufferMinutes:
                number;

              postBufferMinutes:
                number;

              minimumLeadTimeMinutes:
                number;

              maximumAdvanceDays:
                number;

              timeSlotIntervalMinutes:
                number;

              staffMemberId:
                string;
            },
            CreateServiceResult
          >(
            functions,
            "createMicrosoftBookingService"
          );

        const response =
          await fn({
            displayName,

            description:
              newServiceDescription.trim(),

            durationMinutes,

            preBufferMinutes,

            postBufferMinutes,

            minimumLeadTimeMinutes,

            maximumAdvanceDays,

            timeSlotIntervalMinutes,

            staffMemberId:
              selectedStaffMemberId,
          });

        const created =
          response.data
            ?.service;

        if (
          created?.id
        ) {
          setSelectedServiceId(
            created.id
          );
        }

        setServiceMode(
          "existing"
        );

        setDialog({
          type:
            "success",

          title:
            "הפגישה נוצרה",

          message:
            `${created?.displayName || displayName} נוצרה ב-Microsoft Bookings והוגדרה כפגישת ברירת המחדל של MagicTouch.`,
        });

        await loadServices(
          false
        );
      } catch (
        error: any
      ) {
        console.error(
          "[MicrosoftBookingsSettings] create service failed",
          error
        );

        setDialog({
          type:
            "error",

          title:
            "יצירת הפגישה נכשלה",

          message:
            error?.message ||
            "לא ניתן ליצור את סוג הפגישה ב-Microsoft Bookings.",
        });
      } finally {
        setCreatingService(
          false
        );
      }
    };

  const handleTestConnection =
    async () => {
      setTestingConnection(
        true
      );

      try {
        const fn =
          httpsCallable(
            functions,
            "testMicrosoftBookingsConnection"
          );

        const result =
          await fn({});

        const data =
          result.data as {
            microsoftUserEmail?:
              string |
              null;

            bookingBusinessName?:
              string |
              null;
          };

        setDialog({
          type:
            "success",

          title:
            "החיבור תקין",

          message:
            `Microsoft מחובר בהצלחה${
              data.microsoftUserEmail
                ? ` כ-${data.microsoftUserEmail}`
                : ""
            }${
              data.bookingBusinessName
                ? ` לעסק ${data.bookingBusinessName}`
                : ""
            }.`,
        });
      } catch (
        error: any
      ) {
        setDialog({
          type:
            "error",

          title:
            "בדיקת החיבור נכשלה",

          message:
            error?.message ||
            "לא ניתן לאמת את החיבור ל-Microsoft.",
        });
      } finally {
        setTestingConnection(
          false
        );
      }
    };

  const handleDisconnect =
    async () => {
      const approved =
        window.confirm(
          "האם לנתק את חשבון Microsoft Bookings? הסנכרון האוטומטי יופסק."
        );

      if (
        !approved
      ) {
        return;
      }

      setDisconnecting(
        true
      );

      try {
        const fn =
          httpsCallable(
            functions,
            "disconnectMicrosoftBookings"
          );

        await fn({});

        setServices(
          []
        );

        setStaffMembers(
          []
        );

        setSelectedServiceId(
          ""
        );

        setSelectedStaffMemberId(
          ""
        );

        setDialog({
          type:
            "success",

          title:
            "החשבון נותק",

          message:
            "החיבור ל-Microsoft Bookings נותק.",
        });
      } catch (
        error: any
      ) {
        setDialog({
          type:
            "error",

          title:
            "הניתוק נכשל",

          message:
            error?.message ||
            "לא ניתן לנתק את חשבון Microsoft.",
        });
      } finally {
        setDisconnecting(
          false
        );
      }
    };

  if (
    isLoading ||
    isChecking ||
    loadingConfig
  ) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-5xl p-6"
      >
        <div className="rounded-xl border bg-white p-6">
          טוען הגדרות Microsoft Bookings...
        </div>
      </main>
    );
  }

  if (
    !canAccess
  ) {
    return (
      <AccessDenied />
    );
  }

  return (
    <main
      dir="rtl"
      className="mx-auto max-w-5xl space-y-6 p-6 text-right"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">
          Microsoft Bookings
        </h1>

        <p className="text-sm leading-6 text-gray-600">
          חיבור Microsoft 365 מאפשר ל-MagicTouch לזהות פגישות,
          לשייך אותן לאנשי קשר ולהפעיל תהליכים אוטומטיים.
        </p>
      </header>

      {/* Connection */}

      <section className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">
              מצב החיבור
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              החיבור מתבצע ישירות מול Microsoft Graph.
            </p>
          </div>

          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${statusClasses}`}
          >
            {statusLabel}
          </span>
        </div>

        {!config?.connected &&
          connectionStatus !==
            "needs_business_selection" && (
            <div className="space-y-4 rounded-xl border bg-slate-50 p-4">
              <div className="text-sm text-gray-700">
                יש להתחבר עם חשבון Microsoft 365 שמורשה לגשת ל-Bookings.
              </div>

              <Button
                text={
                  connecting
                    ? "מעביר ל-Microsoft..."
                    : "התחבר ל-Microsoft Bookings"
                }
                onClick={
                  handleConnectMicrosoft
                }
                disabled={
                  connecting ||
                  !agentId
                }
              />
            </div>
          )}

        {connectionStatus ===
          "needs_business_selection" && (
            <div className="space-y-4 rounded-xl border border-yellow-300 bg-yellow-50 p-4">
              <div>
                <div className="font-bold">
                  בחירת עסק Microsoft Bookings
                </div>

                <div className="mt-1 text-sm text-gray-700">
                  נמצאו מספר עסקים. יש לבחור את העסק שיחובר.
                </div>
              </div>

              <select
                className="w-full rounded-lg border bg-white px-3 py-2"
                value={
                  selectedBusinessId
                }
                onChange={(
                  event
                ) =>
                  setSelectedBusinessId(
                    event.target.value
                  )
                }
              >
                <option value="">
                  בחר עסק
                </option>

                {(config?.availableBusinesses ||
                  []).map(
                  (
                    business
                  ) => (
                    <option
                      key={
                        business.id
                      }
                      value={
                        business.id
                      }
                    >
                      {
                        business.displayName
                      }
                    </option>
                  )
                )}
              </select>

              <Button
                text={
                  savingBusiness
                    ? "שומר בחירה..."
                    : "שמור עסק Bookings"
                }
                onClick={
                  handleSelectBusiness
                }
                disabled={
                  savingBusiness ||
                  !selectedBusinessId
                }
              />
            </div>
          )}

        {config && (
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard
              label="חשבון Microsoft"
              value={
                config.microsoftUserEmail ||
                config.microsoftUserName ||
                "-"
              }
            />

            <InfoCard
              label="עסק Bookings"
              value={
                config.bookingBusinessName ||
                "-"
              }
            />

            <InfoCard
              label="קישור ציבורי"
              value={
                config.bookingBusinessPublicUrl ||
                "-"
              }
            />

            <InfoCard
              label="סנכרון אחרון"
              value={
                formatTimestamp(
                  config.lastSyncAt
                )
              }
            />

            <InfoCard
              label="סטטוס סנכרון"
              value={
                syncStatusLabel
              }
            />

            <InfoCard
              label="פגישות שנמצאו"
              value={
                config.lastSyncAppointmentCount !=
                null
                  ? String(
                      config.lastSyncAppointmentCount
                    )
                  : "-"
              }
            />

            <InfoCard
              label="פגישות ששויכו"
              value={
                config.lastSyncMatchedCount !=
                null
                  ? String(
                      config.lastSyncMatchedCount
                    )
                  : "-"
              }
            />

            <InfoCard
              label="פגישות ללא התאמה"
              value={
                config.lastSyncUnmatchedCount !=
                null
                  ? String(
                      config.lastSyncUnmatchedCount
                    )
                  : "-"
              }
            />

            <InfoCard
              label="פגישות מבוטלות"
              value={
                config.lastSyncCancelledCount !=
                null
                  ? String(
                      config.lastSyncCancelledCount
                    )
                  : "-"
              }
            />
          </div>
        )}

        {config?.lastSyncError && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
            {config.lastSyncError}
          </div>
        )}

        {config?.connected && (
          <div className="flex flex-wrap gap-3">
            <Button
              text={
                testingConnection
                  ? "בודק חיבור..."
                  : "בדוק חיבור Microsoft"
              }
              onClick={
                handleTestConnection
              }
              disabled={
                testingConnection
              }
            />

            <Button
              text={
                disconnecting
                  ? "מנתק..."
                  : "נתק חשבון Microsoft"
              }
              onClick={
                handleDisconnect
              }
              disabled={
                disconnecting
              }
            />
          </div>
        )}
      </section>

      {/* Staff + availability */}

      {config?.connected &&
        config?.bookingBusinessId && (
          <section className="space-y-5 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-violet-600">
                  זמינות לפגישות
                </div>

                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  מי מקבל את הפגישות ומתי?
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  בחרי את איש הצוות שיקבל את הפגישות והגדירי את חלונות
                  הזמינות שלו. בתוך השעות האלו Microsoft יבדוק גם את
                  יומן Outlook ולא יציע ללקוחות שעות שכבר תפוסות.
                </p>
              </div>

              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                onClick={() =>
                  void loadStaff(
                    true
                  )
                }
                disabled={
                  loadingStaff
                }
              >
                {loadingStaff
                  ? "טוען..."
                  : "רענן אנשי צוות"}
              </button>
            </div>

            {loadingStaff ? (
              <div className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                טוען אנשי צוות מ-Microsoft...
              </div>
            ) : staffMembers.length ===
              0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                לא נמצאו אנשי צוות ב-Microsoft Bookings.
                יש להוסיף לפחות איש צוות אחד לעסק Bookings לפני שניתן
                להגדיר זמינות.
              </div>
            ) : (
              <>
                <div>
                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">
                      מי מקבל את הפגישות?
                    </span>

                    <select
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 md:max-w-xl"
                      value={
                        selectedStaffMemberId
                      }
                      onChange={(
                        event
                      ) =>
                        handleStaffSelection(
                          event.target.value
                        )
                      }
                    >
                      <option value="">
                        בחר איש צוות
                      </option>

                      {staffMembers.map(
                        (
                          member
                        ) => (
                          <option
                            key={
                              member.id
                            }
                            value={
                              member.id
                            }
                          >
                            {
                              member.displayName
                            }
                            {member.emailAddress
                              ? ` · ${member.emailAddress}`
                              : ""}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  {selectedStaffMember ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-700">
                        {
                          selectedStaffMember.displayName
                        }
                      </span>

                      <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                        יומן Outlook נלקח בחשבון
                      </span>
                    </div>
                  ) : null}
                </div>

                {selectedStaffMemberId ? (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="grid grid-cols-[110px_1fr_1fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500 sm:grid-cols-[130px_80px_1fr_1fr]">
                      <div>
                        יום
                      </div>

                      <div className="hidden sm:block">
                        פעיל
                      </div>

                      <div>
                        משעה
                      </div>

                      <div>
                        עד שעה
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100 bg-white">
                      {availability.map(
                        (
                          item
                        ) => (
                          <div
                            key={
                              item.day
                            }
                            className="grid grid-cols-[110px_1fr_1fr] items-center gap-3 px-4 py-3 sm:grid-cols-[130px_80px_1fr_1fr]"
                          >
                            <div className="flex items-center gap-2 font-bold text-slate-800">
                              <input
                                type="checkbox"
                                className="h-4 w-4 sm:hidden"
                                checked={
                                  item.enabled
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateAvailabilityDay(
                                    item.day,
                                    {
                                      enabled:
                                        event.target.checked,
                                    }
                                  )
                                }
                              />

                              {
                                item.label
                              }
                            </div>

                            <div className="hidden sm:block">
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={
                                  item.enabled
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateAvailabilityDay(
                                    item.day,
                                    {
                                      enabled:
                                        event.target.checked,
                                    }
                                  )
                                }
                              />
                            </div>

                            <input
                              type="time"
                              className="h-10 rounded-xl border border-slate-200 bg-white px-2 disabled:bg-slate-100 disabled:text-slate-400"
                              value={
                                item.startTime
                              }
                              disabled={
                                !item.enabled
                              }
                              onChange={(
                                event
                              ) =>
                                updateAvailabilityDay(
                                  item.day,
                                  {
                                    startTime:
                                      event.target.value,
                                  }
                                )
                              }
                            />

                            <input
                              type="time"
                              className="h-10 rounded-xl border border-slate-200 bg-white px-2 disabled:bg-slate-100 disabled:text-slate-400"
                              value={
                                item.endTime
                              }
                              disabled={
                                !item.enabled
                              }
                              onChange={(
                                event
                              ) =>
                                updateAvailabilityDay(
                                  item.day,
                                  {
                                    endTime:
                                      event.target.value,
                                  }
                                )
                              }
                            />
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ) : null}

                {selectedStaffMemberId ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                      השעות מגדירות מתי מותר להציע פגישות.
                      אם קיימת פגישה או חסימה ביומן Microsoft בתוך
                      החלון הזה, אותה שעה לא תוצע ללקוח.
                    </div>

                    <Button
                      text={
                        savingAvailability
                          ? "שומר זמינות..."
                          : "שמור ימים ושעות"
                      }
                      onClick={
                        handleSaveAvailability
                      }
                      disabled={
                        savingAvailability
                      }
                    />
                  </div>
                ) : null}
              </>
            )}
          </section>
        )}

      {/* Service */}

      {config?.connected &&
        config?.bookingBusinessId && (
          <section className="space-y-5 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-blue-600">
                  הפגישה ללקוחות
                </div>

                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  הפגישה שתישלח ללקוחות
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  בחרי סוג פגישה שכבר קיים ב-Microsoft Bookings,
                  או צרי פגישה חדשה מתוך MagicTouch.
                  הפגישה שתבחרי תשמש כברירת המחדל באוטומציות.
                </p>
              </div>

              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                onClick={() =>
                  void loadServices(
                    true
                  )
                }
                disabled={
                  loadingServices
                }
              >
                {loadingServices
                  ? "טוען..."
                  : "רענן מ-Microsoft"}
              </button>
            </div>

            {defaultService ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-emerald-700">
                      פגישת ברירת המחדל
                    </div>

                    <div className="mt-1 text-lg font-bold text-emerald-950">
                      {
                        defaultService.displayName
                      }
                    </div>

                    {defaultService.defaultDuration ? (
                      <div className="mt-1 text-sm text-emerald-800">
                        {durationText(
                          defaultService.defaultDuration
                        )}
                      </div>
                    ) : null}

                    <div className="mt-2 text-sm text-emerald-800">
                      זו הפגישה ש-MagicTouch ישתמש בה כברירת מחדל
                      כאשר Flow שולח ללקוח קישור לקביעת פגישה.
                    </div>
                  </div>

             {defaultService.webUrl ? (
  <div className="flex flex-wrap gap-2">
    <button
      type="button"
      onClick={
        handleCopyBookingLink
      }
      className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50"
    >
      העתק קישור
    </button>

    <a
      href={
        defaultService.webUrl
      }
      target="_blank"
      rel="noreferrer"
      className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50"
    >
      פתח קישור הזמנה
    </a>
  </div>
) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                עדיין לא הוגדרה פגישת ברירת מחדל.
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={[
                  "rounded-2xl border p-4 text-right transition",

                  serviceMode ===
                  "existing"
                    ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100"
                    : "border-slate-200 bg-white hover:border-blue-200",
                ].join(
                  " "
                )}
                onClick={() =>
                  setServiceMode(
                    "existing"
                  )
                }
              >
                <div className="font-bold text-slate-900">
                  בחר פגישה קיימת
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  השתמשי בסוג פגישה שכבר קיים ב-Microsoft Bookings.
                </div>
              </button>

              <button
                type="button"
                className={[
                  "rounded-2xl border p-4 text-right transition",

                  serviceMode ===
                  "create"
                    ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100"
                    : "border-slate-200 bg-white hover:border-blue-200",
                ].join(
                  " "
                )}
                onClick={() =>
                  setServiceMode(
                    "create"
                  )
                }
              >
                <div className="font-bold text-slate-900">
                  צור פגישה חדשה
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  MagicTouch ייצור עבורך סוג פגישה חדש בתוך Microsoft Bookings.
                </div>
              </button>
            </div>

            {serviceMode ===
            "existing" ? (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div>
                  <h3 className="font-bold text-slate-900">
                    בחירת פגישה קיימת
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    נמצאו כרגע {services.length} סוגי פגישות.
                  </p>
                </div>

                {loadingServices ? (
                  <div className="rounded-xl bg-white p-5 text-sm text-slate-500">
                    טוען סוגי פגישות...
                  </div>
                ) : services.length ===
                  0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
                    לא נמצאו סוגי פגישות קיימים.
                    אפשר לעבור ל״צור פגישה חדשה״.
                  </div>
                ) : (
                  <>
                    {services.map(
                      (
                        service
                      ) => {
                        const selected =
                          selectedServiceId ===
                          service.id;

                        return (
                          <button
                            key={
                              service.id
                            }
                            type="button"
                            className={[
                              "block w-full rounded-xl border p-4 text-right transition",

                              selected
                                ? "border-blue-400 bg-blue-50"
                                : "border-slate-200 bg-white hover:border-blue-200",
                            ].join(
                              " "
                            )}
                            onClick={() =>
                              setSelectedServiceId(
                                service.id
                              )
                            }
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="font-bold text-slate-900">
                                  {
                                    service.displayName
                                  }
                                </div>

                                {service.description ? (
                                  <div className="mt-1 text-sm text-slate-500">
                                    {
                                      service.description
                                    }
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {service.defaultDuration ? (
                                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                                    {durationText(
                                      service.defaultDuration
                                    )}
                                  </span>
                                ) : null}

                                {selected ? (
                                  <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                                    נבחרה
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        );
                      }
                    )}

                    <Button
                      text={
                        savingDefaultService
                          ? "שומר פגישה..."
                          : "הגדר כפגישת ברירת מחדל"
                      }
                      onClick={
                        handleSelectExistingService
                      }
                      disabled={
                        savingDefaultService ||
                        !selectedServiceId
                      }
                    />
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div>
                  <h3 className="font-bold text-slate-900">
                    יצירת פגישה חדשה
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    הגדירי את הפגישה פעם אחת, ו-MagicTouch ייצור אותה
                    בתוך Microsoft Bookings וישייך אותה לאיש הצוות שבחרת.
                  </p>
                </div>

                {!selectedStaffMemberId ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    לפני יצירת פגישה חדשה יש לבחור למעלה מי מקבל את
                    הפגישות.
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-bold text-slate-700">
                      שם הפגישה
                    </span>

                    <input
                      type="text"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
                      value={
                        newServiceName
                      }
                      onChange={(
                        event
                      ) =>
                        setNewServiceName(
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">
                      משך הפגישה
                    </span>

                    <select
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
                      value={
                        newServiceDurationMinutes
                      }
                      onChange={(
                        event
                      ) =>
                        setNewServiceDurationMinutes(
                          Number(
                            event.target.value
                          )
                        )
                      }
                    >
                      <option value={15}>
                        15 דקות
                      </option>

                      <option value={30}>
                        30 דקות
                      </option>

                      <option value={45}>
                        45 דקות
                      </option>

                      <option value={60}>
                        60 דקות
                      </option>
                    </select>
                  </label>

                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-bold text-slate-700">
                      תיאור
                    </span>

                    <textarea
                      className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                      value={
                        newServiceDescription
                      }
                      onChange={(
                        event
                      ) =>
                        setNewServiceDescription(
                          event.target.value
                        )
                      }
                    />
                  </label>
                </div>

                <div className="border-t border-slate-200 pt-5">
                  <h4 className="font-bold text-slate-900">
                    כללי הזמנה
                  </h4>

                  <p className="mt-1 text-sm text-slate-500">
                    ההגדרות האלו קובעות איך הפגישה תוצע ללקוחות.
                  </p>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <SelectNumber
                      label="מרווח לפני פגישה"
                      value={
                        preBufferMinutes
                      }
                      options={[
                        0,
                        5,
                        10,
                        15,
                        30,
                      ]}
                      onChange={
                        setPreBufferMinutes
                      }
                      suffix="דקות"
                    />

                    <SelectNumber
                      label="מרווח אחרי פגישה"
                      value={
                        postBufferMinutes
                      }
                      options={[
                        0,
                        5,
                        10,
                        15,
                        30,
                      ]}
                      onChange={
                        setPostBufferMinutes
                      }
                      suffix="דקות"
                    />

                    <label className="block">
                      <span className="mb-2 block text-sm font-bold text-slate-700">
                        מינימום זמן להזמנה מראש
                      </span>

                      <select
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
                        value={
                          minimumLeadTimeMinutes
                        }
                        onChange={(
                          event
                        ) =>
                          setMinimumLeadTimeMinutes(
                            Number(
                              event.target.value
                            )
                          )
                        }
                      >
                        <option value={60}>
                          שעה מראש
                        </option>

                        <option value={120}>
                          שעתיים מראש
                        </option>

                        <option value={240}>
                          4 שעות מראש
                        </option>

                        <option value={720}>
                          12 שעות מראש
                        </option>

                        <option value={1440}>
                          יום מראש
                        </option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-bold text-slate-700">
                        כמה זמן קדימה אפשר להזמין
                      </span>

                      <select
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
                        value={
                          maximumAdvanceDays
                        }
                        onChange={(
                          event
                        ) =>
                          setMaximumAdvanceDays(
                            Number(
                              event.target.value
                            )
                          )
                        }
                      >
                        <option value={14}>
                          14 ימים
                        </option>

                        <option value={30}>
                          30 ימים
                        </option>

                        <option value={60}>
                          60 ימים
                        </option>

                        <option value={90}>
                          90 ימים
                        </option>
                      </select>
                    </label>

                    <SelectNumber
                      label="כל כמה זמן להציע שעת התחלה"
                      value={
                        timeSlotIntervalMinutes
                      }
                      options={[
                        10,
                        15,
                        20,
                        30,
                        45,
                        60,
                      ]}
                      onChange={
                        setTimeSlotIntervalMinutes
                      }
                      suffix="דקות"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                  אחרי היצירה הפגישה תתווסף ל-Microsoft Bookings,
                  תשויך לאיש הצוות שבחרת ותוגדר כפגישת ברירת המחדל
                  של MagicTouch.
                </div>

                <Button
                  text={
                    creatingService
                      ? "יוצר פגישה ב-Microsoft..."
                      : "צור פגישה והגדר כברירת מחדל"
                  }
                  onClick={
                    handleCreateService
                  }
                  disabled={
                    creatingService ||
                    !newServiceName.trim() ||
                    !selectedStaffMemberId
                  }
                />
              </div>
            )}
          </section>
        )}

      {dialog && (
        <DialogNotification
          type={
            dialog.type
          }
          title={
            dialog.title
          }
          message={
            dialog.message
          }
          onConfirm={() =>
            setDialog(
              null
            )
          }
          onCancel={() =>
            setDialog(
              null
            )
          }
          confirmText="אישור"
          hideCancel
        />
      )}
    </main>
  );
}

function SelectNumber({
  label,
  value,
  options,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  options: number[];

  onChange: (
    value: number
  ) => void;

  suffix: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </span>

      <select
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
        value={
          value
        }
        onChange={(
          event
        ) =>
          onChange(
            Number(
              event.target.value
            )
          )
        }
      >
        {options.map(
          (
            option
          ) => (
            <option
              key={
                option
              }
              value={
                option
              }
            >
              {option ===
              0
                ? "ללא"
                : `${option} ${suffix}`}
            </option>
          )
        )}
      </select>
    </label>
  );
}