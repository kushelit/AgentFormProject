import { TableCell } from ".";

export default {
  title: "Components/TableCell",
  component: TableCell,

  argTypes: {
    type: {
      options: [
        "checkbox",
        "date-picker",
        "action-icons",
        "link",
        "drop-down",
        "text",
      ],
      control: { type: "select" },
    },
    state: {
      options: [
        "default",
        "selected",
        "edit",
        "hover",
        "hover-field",
        "summary",
        "disabled",
      ],
      control: { type: "select" },
    },
    link: {
      options: ["default", "parent", "empty", "bottom", "middle"],
      control: { type: "select" },
    },
  },
};

export const Default = {
  args: {
    type: "checkbox",
    state: "default",
    link: "default",
    className: {},
  },
};
