// Document types for PouchDB

export type DocType = 'project' | 'report' | 'note' | 'chat' | 'reference' | 'queue-item' | 'link' | 'topic';

export interface BaseDoc {
  _id: string;
  _rev?: string;
  type: DocType;
  createdAt: string;
  updatedAt: string;
}

export interface Project extends BaseDoc {
  type: 'project';
  title: string;
  description: string;
  tags: string[];
}

export interface Topic extends BaseDoc {
  type: 'topic';
  projectId: string;
  name: string;
}

export interface Report extends BaseDoc {
  type: 'report';
  projectId: string | null;
  title: string;
  htmlContent: string;
  sourceQuery: string;
  topicIds?: string[];
}

export interface Note extends BaseDoc {
  type: 'note';
  projectId: string | null;
  title: string;
  content: string; // markdown
  tags: string[];
  topicIds?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Chat extends BaseDoc {
  type: 'chat';
  projectId: string | null;
  title: string;
  messages: ChatMessage[];
  topicIds?: string[];
}

export type RefType = 'video' | 'blog' | 'paper' | 'link' | 'book' | 'podcast';

export interface Reference extends BaseDoc {
  type: 'reference';
  projectId: string | null;
  title: string;
  url: string;
  refType: RefType;
  author: string;
  notes: string;
  tags: string[];
  topicIds?: string[];
}

export type QueueStatus = 'open' | 'done';

export interface QueueItem extends BaseDoc {
  type: 'queue-item';
  projectId: string;
  text: string;
  linkedDocId: string | null;
  topicIds?: string[];
  status: QueueStatus;
  priority: number;
}

export interface Link extends BaseDoc {
  type: 'link';
  sourceId: string;
  sourceType: DocType;
  targetId: string;
  targetType: DocType;
}

export type AnyDoc = Project | Report | Note | Chat | Reference | QueueItem | Link | Topic;

// Helper type for docs that belong to a project
export type ProjectContent = Report | Note | Chat | Reference;
