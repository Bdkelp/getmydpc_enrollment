import { useState } from "react";

export interface AssignAgentNumberDialog {
  open: boolean;
  userId: string;
  currentNumber: string | null;
}

export interface EditUserDialog {
  open: boolean;
  user: any | null;
}

export interface EditFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface AdminUserDialogState {
  assignAgentNumberDialog: AssignAgentNumberDialog;
  setAssignAgentNumberDialog: React.Dispatch<React.SetStateAction<AssignAgentNumberDialog>>;
  agentNumberInput: string;
  setAgentNumberInput: React.Dispatch<React.SetStateAction<string>>;
  createUserDialogOpen: boolean;
  setCreateUserDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  editUserDialog: EditUserDialog;
  setEditUserDialog: React.Dispatch<React.SetStateAction<EditUserDialog>>;
  editFormData: EditFormData;
  setEditFormData: React.Dispatch<React.SetStateAction<EditFormData>>;
}

export function useAdminUserDialogState(): AdminUserDialogState {
  const [assignAgentNumberDialog, setAssignAgentNumberDialog] = useState<AssignAgentNumberDialog>({
    open: false,
    userId: '',
    currentNumber: null,
  });
  const [agentNumberInput, setAgentNumberInput] = useState('');
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [editUserDialog, setEditUserDialog] = useState<EditUserDialog>({ open: false, user: null });
  const [editFormData, setEditFormData] = useState<EditFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  return {
    assignAgentNumberDialog,
    setAssignAgentNumberDialog,
    agentNumberInput,
    setAgentNumberInput,
    createUserDialogOpen,
    setCreateUserDialogOpen,
    editUserDialog,
    setEditUserDialog,
    editFormData,
    setEditFormData,
  };
}
