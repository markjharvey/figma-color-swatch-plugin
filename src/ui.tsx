import { h } from 'preact'
import { Button, Container, Text, VerticalSpace } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'

function Plugin() {
  function handleClick() {
    emit('CREATE_SHAPES')
  }

  return (
    <Container space="medium">
      <VerticalSpace space="medium" />
      <Text>Rainbow Color System</Text>
      <VerticalSpace space="medium" />
      <Button fullWidth onClick={handleClick}>
        Create Rectangle
      </Button>
    </Container>
  )
}

export default Plugin 