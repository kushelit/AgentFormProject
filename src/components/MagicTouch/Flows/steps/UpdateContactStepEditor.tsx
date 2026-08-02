"use client";

import React, {
  useMemo,
} from "react";

import type {
  FlowStep,
} from "@/lib/MagicTouch/flows/types";

type Props = {
  step:
    FlowStep;

  onConfigChange:
    (
      patch:
        Record<
          string,
          unknown
        >
    ) => void;
};

type FieldDefinition = {
  path:
    string;

  label:
    string;

  valueType:
    | "select"
    | "text"
    | "timestamp"
    | "run_id"
    | "url"
    | "event";

  options?:
    Array<{
      value:
        string;

      label:
        string;
    }>;

  defaultValue?:
    string;
};

type UpdateRow = {
  id:
    string;

  fieldPath:
    string;

  value:
    string;
};

const FIELD_DEFINITIONS:
  FieldDefinition[] = [
    {
      path:
        "engagement.reengagement.status",

      label:
        "סטטוס תהליך חידוש קשר",

      valueType:
        "select",

      defaultValue:
        "interested",

      options: [
        {
          value:
            "pending",

          label:
            "ממתין",
        },

        {
          value:
            "sent",

          label:
            "נשלחה פנייה",
        },

        {
          value:
            "interested",

          label:
            "מעוניין",
        },

        {
          value:
            "declined",

          label:
            "לא מעוניין",
        },

        {
          value:
            "booked",

          label:
            "נקבעה פגישה",
        },

        {
          value:
            "completed",

          label:
            "הושלם",
        },
      ],
    },

    {
      path:
        "engagement.reengagement.interestStatus",

      label:
        "סטטוס התעניינות",

      valueType:
        "select",

      defaultValue:
        "interested",

      options: [
        {
          value:
            "pending",

          label:
            "ממתין לתשובה",
        },

        {
          value:
            "interested",

          label:
            "מעוניין",
        },

        {
          value:
            "not_interested",

          label:
            "לא מעוניין",
        },
      ],
    },

    {
      path:
        "engagement.reengagement.interestRespondedAt",

      label:
        "מועד תגובת הלקוח",

      valueType:
        "timestamp",

      defaultValue:
        "{{nowTimestamp}}",
    },

    {
      path:
        "engagement.reengagement.bookingStatus",

      label:
        "סטטוס קביעת פגישה",

      valueType:
        "select",

      defaultValue:
        "link_sent",

      options: [
        {
          value:
            "not_sent",

          label:
            "הקישור טרם נשלח",
        },

        {
          value:
            "link_sent",

          label:
            "קישור נשלח",
        },

        {
          value:
            "booked",

          label:
            "נקבעה פגישה",
        },

        {
          value:
            "cancelled",

          label:
            "הפגישה בוטלה",
        },

        {
          value:
            "no_booking",

          label:
            "לא נקבעה פגישה",
        },
      ],
    },

    {
      path:
        "engagement.reengagement.bookingLink",

      label:
        "קישור לקביעת פגישה",

      valueType:
        "url",

      defaultValue:
        "",
    },

    {
      path:
        "engagement.reengagement.bookingLinkSentAt",

      label:
        "מועד שליחת קישור הפגישה",

      valueType:
        "timestamp",

      defaultValue:
        "{{nowTimestamp}}",
    },

    {
      path:
        "engagement.reengagement.bookedAt",

      label:
        "מועד קביעת הפגישה",

      valueType:
        "timestamp",

      defaultValue:
        "{{nowTimestamp}}",
    },

    {
      path:
        "engagement.reengagement.bookingAppointmentId",

      label:
        "מזהה הפגישה",

      valueType:
        "event",

      defaultValue:
        "{{event.bookingAppointmentId}}",
    },

    {
      path:
        "engagement.reengagement.bookingStartAt",

      label:
        "מועד תחילת הפגישה",

      valueType:
        "event",

      defaultValue:
        "{{event.bookingStartAt}}",
    },

    {
      path:
        "engagement.reengagement.bookingEndAt",

      label:
        "מועד סיום הפגישה",

      valueType:
        "event",

      defaultValue:
        "{{event.bookingEndAt}}",
    },

    {
      path:
        "engagement.reengagement.bookingServiceName",

      label:
        "שם שירות הפגישה",

      valueType:
        "event",

      defaultValue:
        "{{event.bookingServiceName}}",
    },

    {
      path:
        "engagement.reengagement.bookingCancelledAt",

      label:
        "מועד ביטול הפגישה",

      valueType:
        "timestamp",

      defaultValue:
        "{{nowTimestamp}}",
    },

    {
      path:
        "engagement.reengagement.resolvedAt",

      label:
        "מועד סיום הטיפול",

      valueType:
        "timestamp",

      defaultValue:
        "{{nowTimestamp}}",
    },

    {
      path:
        "engagement.reengagement.surenseSyncStatus",

      label:
        "סטטוס סנכרון לשורנס",

      valueType:
        "select",

      defaultValue:
        "completed",

      options: [
        {
          value:
            "pending",

          label:
            "ממתין לסנכרון",
        },

        {
          value:
            "completed",

          label:
            "סונכרן בהצלחה",
        },

        {
          value:
            "failed",

          label:
            "הסנכרון נכשל",
        },
      ],
    },

    {
      path:
        "engagement.reengagement.lastFlowRunId",

      label:
        "מזהה הרצת התהליך האחרונה",

      valueType:
        "run_id",

      defaultValue:
        "{{run.runId}}",
    },

    {
      path:
        "engagement.reengagement.updatedAt",

      label:
        "מועד עדכון אחרון",

      valueType:
        "timestamp",

      defaultValue:
        "{{nowTimestamp}}",
    },
  ];

function createRowId(): string {
  return (
    globalThis.crypto
      ?.randomUUID?.() ||
    `row_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`
  );
}

function getDefinition(
  path:
    string
): FieldDefinition | undefined {
  return FIELD_DEFINITIONS.find(
    (
      field
    ) =>
      field.path ===
      path
  );
}

function updatesToRows(
  updates:
    Record<
      string,
      unknown
    >
): UpdateRow[] {
  return Object.entries(
    updates
  ).map(
    ([
      fieldPath,
      value,
    ]) => ({
      id:
        createRowId(),

      fieldPath,

      value:
        value ===
          null ||
        value ===
          undefined
          ? ""
          : String(
            value
          ),
    })
  );
}

function rowsToUpdates(
  rows:
    UpdateRow[]
): Record<
  string,
  unknown
> {
  const updates:
    Record<
      string,
      unknown
    > = {};

  for (
    const row of rows
  ) {
    const path =
      row.fieldPath
        .trim();

    if (
      !path
    ) {
      continue;
    }

    updates[path] =
      row.value;
  }

  return updates;
}

export default function UpdateContactStepEditor({
  step,
  onConfigChange,
}: Props) {
  const updates =
    useMemo(
      () => {
        const rawUpdates =
          step.config
            ?.updates;

        if (
          rawUpdates &&
          typeof rawUpdates ===
            "object" &&
          !Array.isArray(
            rawUpdates
          )
        ) {
          return rawUpdates as Record<
            string,
            unknown
          >;
        }

        return {};
      },
      [
        step.config
          ?.updates,
      ]
    );

  const rows =
    useMemo(
      () =>
        updatesToRows(
          updates
        ),
      [
        updates,
      ]
    );

  const commitRows = (
    nextRows:
      UpdateRow[]
  ) => {
    onConfigChange({
      updates:
        rowsToUpdates(
          nextRows
        ),
    });
  };

  const addRow = () => {
    const firstUnusedField =
      FIELD_DEFINITIONS.find(
        (
          field
        ) =>
          !rows.some(
            (
              row
            ) =>
              row.fieldPath ===
              field.path
          )
      ) ||
      FIELD_DEFINITIONS[0];

    commitRows([
      ...rows,

      {
        id:
          createRowId(),

        fieldPath:
          firstUnusedField
            .path,

        value:
          firstUnusedField
            .defaultValue ||
          "",
      },
    ]);
  };

  const updateRow = (
    rowId:
      string,

    patch:
      Partial<
        UpdateRow
      >
  ) => {
    const nextRows =
      rows.map(
        (
          row
        ) => {
          if (
            row.id !==
            rowId
          ) {
            return row;
          }

          const nextRow = {
            ...row,
            ...patch,
          };

          if (
            patch.fieldPath
          ) {
            const definition =
              getDefinition(
                patch.fieldPath
              );

            nextRow.value =
              definition
                ?.defaultValue ||
              "";
          }

          return nextRow;
        }
      );

    commitRows(
      nextRows
    );
  };

  const removeRow = (
    rowId:
      string
  ) => {
    commitRows(
      rows.filter(
        (
          row
        ) =>
          row.id !==
          rowId
      )
    );
  };

  return (
    <div className="md:col-span-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            אילו נתונים לעדכן באיש הקשר?
          </h3>

          <p className="mt-1 text-xs text-gray-500">
            בחרי שדה וערך. המערכת תבנה את עדכון Firestore מאחורי הקלעים.
          </p>
        </div>

        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={
            addRow
          }
        >
          + הוספת שדה
        </button>
      </div>

      {
        rows.length ===
        0
          ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-gray-500">
                עדיין לא נבחרו שדות לעדכון.
              </p>

              <button
                type="button"
                className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white"
                onClick={
                  addRow
                }
              >
                הוספת השדה הראשון
              </button>
            </div>
          )
          : (
            <div className="space-y-3">
              {
                rows.map(
                  (
                    row,
                    index
                  ) => {
                    const definition =
                      getDefinition(
                        row.fieldPath
                      );

                    return (
                      <div
                        key={
                          row.id
                        }
                        className="rounded-xl border bg-gray-50 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">
                            עדכון {index + 1}
                          </div>

                          <button
                            type="button"
                            className="text-sm text-red-600"
                            onClick={() =>
                              removeRow(
                                row.id
                              )
                            }
                          >
                            הסרה
                          </button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <label>
                            <span className="mb-1 block text-sm font-medium">
                              שדה
                            </span>

                            <select
                              className="w-full rounded-lg border bg-white px-3 py-2"
                              value={
                                row.fieldPath
                              }
                              onChange={(
                                event
                              ) =>
                                updateRow(
                                  row.id,
                                  {
                                    fieldPath:
                                      event.target
                                        .value,
                                  }
                                )
                              }
                            >
                              {
                                FIELD_DEFINITIONS.map(
                                  (
                                    field
                                  ) => (
                                    <option
                                      key={
                                        field.path
                                      }
                                      value={
                                        field.path
                                      }
                                    >
                                      {
                                        field.label
                                      }
                                    </option>
                                  )
                                )
                              }
                            </select>
                          </label>

                          <label>
                            <span className="mb-1 block text-sm font-medium">
                              ערך
                            </span>

                            {
                              definition
                                ?.valueType ===
                              "select"
                                ? (
                                  <select
                                    className="w-full rounded-lg border bg-white px-3 py-2"
                                    value={
                                      row.value
                                    }
                                    onChange={(
                                      event
                                    ) =>
                                      updateRow(
                                        row.id,
                                        {
                                          value:
                                            event.target
                                              .value,
                                        }
                                      )
                                    }
                                  >
                                    {
                                      definition
                                        .options
                                        ?.map(
                                          (
                                            option
                                          ) => (
                                            <option
                                              key={
                                                option.value
                                              }
                                              value={
                                                option.value
                                              }
                                            >
                                              {
                                                option.label
                                              }
                                            </option>
                                          )
                                        )
                                    }
                                  </select>
                                )
                                : definition
                                  ?.valueType ===
                                  "timestamp"
                                  ? (
                                    <select
                                      className="w-full rounded-lg border bg-white px-3 py-2"
                                      value={
                                        row.value
                                      }
                                      onChange={(
                                        event
                                      ) =>
                                        updateRow(
                                          row.id,
                                          {
                                            value:
                                              event.target
                                                .value,
                                          }
                                        )
                                      }
                                    >
                                      <option value="{{nowTimestamp}}">
                                        הזמן הנוכחי
                                      </option>

                                      <option value="">
                                        ללא ערך
                                      </option>
                                    </select>
                                  )
                                  : definition
                                    ?.valueType ===
                                    "run_id"
                                    ? (
                                      <select
                                        className="w-full rounded-lg border bg-white px-3 py-2"
                                        value={
                                          row.value
                                        }
                                        onChange={(
                                          event
                                        ) =>
                                          updateRow(
                                            row.id,
                                            {
                                              value:
                                                event.target
                                                  .value,
                                            }
                                          )
                                        }
                                      >
                                        <option value="{{run.runId}}">
                                          מזהה ההרצה הנוכחית
                                        </option>
                                      </select>
                                    )
                                    : definition
                                      ?.valueType ===
                                    "event"
                                    ? (
                                      <select
                                        className="w-full rounded-lg border bg-white px-3 py-2"
                                        value={
                                          row.value
                                        }
                                        onChange={(
                                          event
                                        ) =>
                                          updateRow(
                                            row.id,
                                            {
                                              value:
                                                event.target
                                                  .value,
                                            }
                                          )
                                        }
                                      >
                                        {
                                          definition.path ===
                                          "engagement.reengagement.bookingAppointmentId"
                                            ? (
                                              <option value="{{event.bookingAppointmentId}}">
                                                מזהה הפגישה מהאירוע
                                              </option>
                                            )
                                            : null
                                        }

                                        {
                                          definition.path ===
                                          "engagement.reengagement.bookingStartAt"
                                            ? (
                                              <option value="{{event.bookingStartAt}}">
                                                מועד תחילת הפגישה מהאירוע
                                              </option>
                                            )
                                            : null
                                        }

                                        {
                                          definition.path ===
                                          "engagement.reengagement.bookingEndAt"
                                            ? (
                                              <option value="{{event.bookingEndAt}}">
                                                מועד סיום הפגישה מהאירוע
                                              </option>
                                            )
                                            : null
                                        }

                                        {
                                          definition.path ===
                                          "engagement.reengagement.bookingServiceName"
                                            ? (
                                              <option value="{{event.bookingServiceName}}">
                                                שם השירות מהאירוע
                                              </option>
                                            )
                                            : null
                                        }

                                        <option value="">
                                          ללא ערך
                                        </option>
                                      </select>
                                    )
                                    : (
                                      <input
                                        type={
                                          definition
                                            ?.valueType ===
                                          "url"
                                            ? "url"
                                            : "text"
                                        }
                                        className="w-full rounded-lg border bg-white px-3 py-2"
                                        value={
                                          row.value
                                        }
                                        onChange={(
                                          event
                                        ) =>
                                          updateRow(
                                            row.id,
                                            {
                                              value:
                                                event.target
                                                  .value,
                                            }
                                          )
                                        }
                                        placeholder={
                                          definition
                                            ?.valueType ===
                                          "url"
                                            ? "https://..."
                                            : "ערך"
                                        }
                                      />
                                    )
                            }
                          </label>
                        </div>
                      </div>
                    );
                  }
                )
              }
            </div>
          )
      }
    </div>
  );
}
