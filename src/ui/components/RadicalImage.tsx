import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import {
  radicalImages,
  type RadicalImageContent,
  type RadicalImageSource,
} from '@/features/media/radicalImages';

interface RadicalImageProps {
  readonly image?: RadicalImageSource;
  readonly size: number;
  readonly color: string;
  readonly onReadyChange?: (ready: boolean) => void;
  readonly compact?: boolean;
}

/** Both quiz heroes and selection tiles render the same durable public content. */
export function RadicalImage(props: RadicalImageProps) {
  return (
    <RadicalImageContentView
      key={`${props.image?.url}:${props.image?.content_type}`}
      {...props}
    />
  );
}

function RadicalImageContentView({
  image,
  size,
  color,
  onReadyChange,
  compact = false,
}: RadicalImageProps) {
  const [attempt, setAttempt] = useState(0);
  const [content, setContent] = useState<RadicalImageContent | null>(null);
  const [failed, setFailed] = useState(false);
  const [rendered, setRendered] = useState(false);
  const url = image?.url;
  const contentType = image?.content_type;
  useEffect(() => {
    let active = true;
    onReadyChange?.(false);
    const source = url === undefined || contentType === undefined
      ? undefined : { url, content_type: contentType };
    void radicalImages.load(source, attempt > 0).then((result) => {
      if (!active) return;
      setContent(result);
      // SvgXml parses synchronously and does not emit a native onLoad event.
      // The cache validates its XML with the same parser before publishing.
      if (result.kind === 'svg') {
        setRendered(true);
        onReadyChange?.(true);
      }
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [url, contentType, attempt, onReadyChange]);
  const fail = () => {
    setFailed(true);
    setRendered(false);
    onReadyChange?.(false);
  };
  const ready = () => {
    setRendered(true);
    onReadyChange?.(true);
  };
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      {failed && compact ? (
        <Text style={{ color }}>!</Text>
      ) : failed ? (
        <>
          <Text accessibilityRole="alert" style={{ color, textAlign: 'center' }}>
            Radical image unavailable. Connect and retry, or exit to resume later.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry radical image"
            onPress={() => {
              setContent(null);
              setFailed(false);
              setRendered(false);
              onReadyChange?.(false);
              setAttempt((value) => value + 1);
            }}
            style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 }}
          >
            <Text style={{ color }}>Retry image</Text>
          </Pressable>
        </>
      ) : content?.kind === 'svg' ? (
        <SvgXml
          accessible
          accessibilityLabel="Radical image"
          xml={content.content}
          width={size}
          height={size}
          color={color}
          onError={fail}
        />
      ) : content?.kind === 'raster' ? (
        <Image
          accessible
          accessibilityLabel="Radical image"
          source={{ uri: content.content }}
          style={{ width: size, height: size }}
          onError={fail}
          onLoad={ready}
        />
      ) : null}
      {!failed && !rendered ? (
        <Text accessibilityLiveRegion="polite" style={{ color }}>
          {compact ? '…' : 'Loading radical image…'}
        </Text>
      ) : null}
    </View>
  );
}
