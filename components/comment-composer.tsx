"use client"

import { useState, useTransition, type KeyboardEvent } from "react"
import { useAction } from "convex/react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/convex/_generated/api"

interface CommentComposerProps {
  issueIdentifier: string
  canComment: boolean
}

const HAS_CONVEX = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)

export function CommentComposer({ issueIdentifier, canComment }: CommentComposerProps) {
  if (!HAS_CONVEX) {
    return null
  }

  return <CommentComposerWithConvex issueIdentifier={issueIdentifier} canComment={canComment} />
}

function CommentComposerWithConvex({ issueIdentifier, canComment }: CommentComposerProps) {
  const t = useTranslations("CommentComposer")
  const [body, setBody] = useState("")
  const [attachmentUrl, setAttachmentUrl] = useState("")
  const [attachmentTitle, setAttachmentTitle] = useState("")
  const [attachmentSubtitle, setAttachmentSubtitle] = useState("")
  const [showAttachmentFields, setShowAttachmentFields] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const createComment = useAction(api.comments.createScoped)

  if (!canComment) {
    return null
  }

  const submitComment = () => {
    if (isPending) return
    setError(null)
    const trimmed = body.trim()
    if (!trimmed) {
      setError(t("errors.empty"))
      return
    }
    const hasAttachmentInput = attachmentUrl.trim().length > 0 || attachmentTitle.trim().length > 0
    if (hasAttachmentInput) {
      if (!attachmentUrl.trim() || !attachmentTitle.trim()) {
        setError(t("errors.attachmentIncomplete"))
        return
      }
      try {
        new URL(attachmentUrl.trim())
      } catch {
        setError(t("errors.attachmentInvalidUrl"))
        return
      }
    }

    startTransition(async () => {
      const result = await createComment({
        issueIdentifier,
        body: trimmed,
        attachments: hasAttachmentInput
          ? [
            {
              url: attachmentUrl.trim(),
              title: attachmentTitle.trim(),
              subtitle: attachmentSubtitle.trim() || undefined,
            },
          ]
          : undefined,
      })

      if (!result?.ok) {
        setError(result?.errorCode === "FORBIDDEN" ? t("errors.forbidden") : t("errors.postFailed"))
        return
      }

      setBody("")
      setAttachmentUrl("")
      setAttachmentTitle("")
      setAttachmentSubtitle("")
      setShowAttachmentFields(false)
    })
  }

  const onBodyKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return
    }
    event.preventDefault()
    submitComment()
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={onBodyKeyDown}
        rows={4}
        placeholder={t("placeholder")}
      />
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => setShowAttachmentFields((prev) => !prev)}>
          {showAttachmentFields ? t("attachments.remove") : t("attachments.add")}
        </Button>
        <Button type="button" onClick={submitComment} disabled={isPending}>
          {isPending ? t("posting") : t("submit")}
        </Button>
      </div>
      {showAttachmentFields ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={attachmentTitle}
            onChange={(event) => setAttachmentTitle(event.target.value)}
            placeholder={t("attachments.titlePlaceholder")}
          />
          <Input
            value={attachmentUrl}
            onChange={(event) => setAttachmentUrl(event.target.value)}
            placeholder={t("attachments.urlPlaceholder")}
          />
          <Input
            value={attachmentSubtitle}
            onChange={(event) => setAttachmentSubtitle(event.target.value)}
            placeholder={t("attachments.subtitlePlaceholder")}
            className="sm:col-span-2"
          />
        </div>
      ) : null}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
