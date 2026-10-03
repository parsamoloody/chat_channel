export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends DomainError {}
export class ForbiddenError extends DomainError {}
export class UnauthorizedError extends DomainError {}
export class ConflictError extends DomainError {}
export class ValidationError extends DomainError {}
export class InvalidReferralPayloadError extends ValidationError {}
export class MatchNotFoundError extends NotFoundError {}
export class MatchExpiredError extends ForbiddenError {}
export class UserNotMatchParticipantError extends ForbiddenError {}
export class UserNotChatParticipantError extends ForbiddenError {}
export class ChatNotFoundError extends NotFoundError {}
export class DuplicateParticipantError extends ConflictError {}
export class DuplicateChatError extends ConflictError {}
